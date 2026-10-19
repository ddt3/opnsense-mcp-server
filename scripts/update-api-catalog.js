#!/usr/bin/env node
// Regenerates lib/api-catalog.json from the OPNsense API docs and sources.
//
// Usage: node scripts/update-api-catalog.js [--docs DIR] [--core DIR] [--plugins DIR]
// Each repo that is not given is shallow-cloned from github.com/opnsense
// into a temp dir (core and plugins sparsely: API controllers only).
// Run it after an OPNsense release to pick up new and removed endpoints.
//
// The docs give methods and params per controller; the sources add the
// actions controllers inherit from custom base classes, which the docs miss.

import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizePath, parseRst } from '../lib/api-catalog.js';
import { controllerEndpoints, parseController } from '../lib/php-controllers.js';

const REPOS = {
  docs: { url: 'https://github.com/opnsense/docs.git' },
  core: { url: 'https://github.com/opnsense/core.git', sparse: true },
  plugins: { url: 'https://github.com/opnsense/plugins.git', sparse: true },
};
// Docs folder per section: core, plugins and the Business Edition
const DOC_KINDS = { core: 'core', plugins: 'plugin', be: 'business' };
const SPARSE = ['/**/controllers/OPNsense/*/Api/*.php', '/**/controllers/OPNsense/Base/*.php'];

const args = process.argv.slice(2);
const dirs = {};
for (let i = 0; i < args.length; i += 2) dirs[args[i].replace(/^--/, '')] = args[i + 1];

const tempDir = mkdtempSync(join(tmpdir(), 'opnsense-api-'));
try {
  for (const [name, repo] of Object.entries(REPOS)) {
    if (dirs[name]) continue;
    dirs[name] = join(tempDir, name);
    const clone = ['clone', '--quiet', '--depth', '1', ...(repo.sparse ? ['--filter=blob:none', '--sparse'] : []), repo.url, dirs[name]];
    execFileSync('git', clone, { stdio: 'inherit' });
    if (repo.sparse) execFileSync('git', ['-C', dirs[name], 'sparse-checkout', 'set', '--no-cone', ...SPARSE], { stdio: 'inherit' });
  }

  // Documented endpoints first: they carry the most reliable methods
  const apiDir = join(dirs.docs, 'source', 'development', 'api');
  const endpoints = [];
  for (const [folder, kind] of Object.entries(DOC_KINDS)) {
    for (const file of readdirSync(join(apiDir, folder)).filter(f => f.endsWith('.rst')).sort()) {
      endpoints.push(...parseRst(readFileSync(join(apiDir, folder, file), 'utf8'), kind));
    }
  }

  // Then every routable controller action from the sources, inherited ones included
  const classes = [];
  for (const name of ['core', 'plugins']) {
    for (const file of findPhp(dirs[name])) {
      const cls = parseController(readFileSync(file, 'utf8'), file);
      if (cls) classes.push(cls);
    }
  }
  const kindOf = file => (file.startsWith(dirs.plugins) ? 'plugin' : 'core');
  const known = new Set(endpoints.map(e => normalizePath(e.path)));
  let added = 0;
  for (const endpoint of controllerEndpoints(classes, kindOf)) {
    const key = normalizePath(endpoint.path);
    if (known.has(key)) continue;
    known.add(key);
    endpoints.push({ ...endpoint, fromSource: true });
    added++;
  }
  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const header = { generated: new Date().toISOString().slice(0, 10), count: endpoints.length };
  for (const name of Object.keys(REPOS)) header[name] = commitOf(dirs[name]);

  // One endpoint per line keeps the file small and its diffs readable
  const out = new URL('../lib/api-catalog.json', import.meta.url);
  const head = JSON.stringify(header, null, 1).slice(0, -2);
  writeFileSync(out, `${head},\n "endpoints": [\n${endpoints.map(e => '  ' + JSON.stringify(e)).join(',\n')}\n ]\n}\n`);
  console.log(`Wrote ${endpoints.length} endpoints (${added} only found in sources)`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

// Controller files present on disk (a sparse checkout lists more than it has)
function findPhp(dir) {
  return readdirSync(dir, { recursive: true })
    .filter(f => f.endsWith('.php') && f.includes('/controllers/OPNsense/') && !f.includes('/.git/'))
    .sort()
    .map(f => join(dir, f));
}

function commitOf(dir) {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%h %cI'], { encoding: 'utf8' }).trim();
}

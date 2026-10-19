#!/usr/bin/env node
// Regenerates lib/api-catalog.json from the OPNsense API docs.
//
// Usage: node scripts/update-api-catalog.js [path/to/opnsense-docs]
// Without a path it shallow-clones github.com/opnsense/docs into a temp dir.
// Run it after an OPNsense release to pick up new and removed endpoints.

import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseRst } from '../lib/api-catalog.js';

const DOCS_REPO = 'https://github.com/opnsense/docs.git';
// Docs folder per section: core, plugins and the Business Edition
const KINDS = { core: 'core', plugins: 'plugin', be: 'business' };

let docsDir = process.argv[2];
let tempDir = null;
if (!docsDir) {
  tempDir = mkdtempSync(join(tmpdir(), 'opnsense-docs-'));
  execFileSync('git', ['clone', '--quiet', '--depth', '1', DOCS_REPO, tempDir], { stdio: 'inherit' });
  docsDir = tempDir;
}

try {
  const apiDir = join(docsDir, 'source', 'development', 'api');
  const endpoints = [];
  for (const [folder, kind] of Object.entries(KINDS)) {
    for (const file of readdirSync(join(apiDir, folder)).filter(f => f.endsWith('.rst')).sort()) {
      endpoints.push(...parseRst(readFileSync(join(apiDir, folder, file), 'utf8'), kind));
    }
  }
  endpoints.sort((a, b) => a.path.localeCompare(b.path));

  const commit = execFileSync('git', ['-C', docsDir, 'log', '-1', '--format=%h %cI'], { encoding: 'utf8' }).trim();
  const [docsCommit, docsDate] = commit.split(' ');
  const header = { source: DOCS_REPO, docsCommit, docsDate, count: endpoints.length };

  // One endpoint per line keeps the file small and its diffs readable
  const out = new URL('../lib/api-catalog.json', import.meta.url);
  const head = JSON.stringify(header, null, 1).slice(0, -2);
  writeFileSync(out, `${head},\n "endpoints": [\n${endpoints.map(e => '  ' + JSON.stringify(e)).join(',\n')}\n ]\n}\n`);
  console.log(`Wrote ${endpoints.length} endpoints from docs ${docsCommit} (${docsDate})`);
} finally {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}

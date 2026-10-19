// Catalog of every OPNsense API endpoint, built from the official API docs.
//
// The typescript client misses ~500 endpoints and still carries some that
// OPNsense removed. The reference at docs.opnsense.org/development/api is
// generated from the OPNsense sources, so its RST tables are the most
// complete list available. scripts/update-api-catalog.js turns them into
// lib/api-catalog.json; this module parses and queries that catalog.

import { readFileSync } from 'fs';

// "``GET,POST``","firewall","alias","toggle_item","$uuid,$enabled=null"
const ROW = /^\s*"``([A-Z,]+)``","([^"]*)","([^"]*)","([^"]*)","([^"]*)"\s*$/;
const TABLE = /^\.\. csv-table:: Resources \((\w+)\.php\)/;

export function parseParams(text) {
  if (!text.trim()) return [];
  return text.split(',').map(raw => {
    const [name, ...def] = raw.trim().replace(/^\$/, '').split('=');
    return def.length
      ? { name, optional: true, default: def.join('=').replace(/^'(.*)'$/, '$1') }
      : { name, optional: false };
  });
}

// Parses one docs RST file into endpoint entries
export function parseRst(text, kind) {
  const entries = [];
  let source = null;
  for (const line of text.split('\n')) {
    const table = line.match(TABLE);
    if (table) {
      source = `${table[1]}.php`;
      continue;
    }
    const row = line.match(ROW);
    if (!row) continue;
    const [, methods, module, controller, command, params] = row;
    entries.push({
      path: `${module}/${controller}/${command}`,
      module,
      controller,
      command,
      methods: methods.split(','),
      params: parseParams(params),
      kind,
      source,
    });
  }
  return entries;
}

// OPNsense routes case-insensitively and maps snake_case onto camelCase
// actions, so add_pac_match and add_p_a_c_match reach the same action.
export function normalizePath(path) {
  return path.split('/').map(part => part.replace(/_/g, '').toLowerCase()).join('/');
}

export class ApiCatalog {
  constructor(entries) {
    this.entries = entries;
    this.byPath = new Map();
    for (const entry of entries) {
      const key = normalizePath(entry.path);
      // Core and plugin docs never overlap; keep the first if they ever do
      if (!this.byPath.has(key)) this.byPath.set(key, entry);
    }
  }

  static load(file = new URL('./api-catalog.json', import.meta.url)) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return new ApiCatalog(data.endpoints);
  }

  find(path) {
    return this.byPath.get(normalizePath(path)) ?? null;
  }

  modules() {
    const modules = new Map();
    for (const entry of this.entries) {
      if (!modules.has(entry.module)) modules.set(entry.module, { name: entry.module, kind: entry.kind, count: 0 });
      modules.get(entry.module).count++;
    }
    return [...modules.values()];
  }

  // Endpoints filtered by module, controller and a substring of the path
  list({ module, controller, filter } = {}) {
    const needle = filter ? normalizePath(filter) : null;
    return this.entries.filter(entry =>
      (!module || entry.module === module) &&
      (!controller || normalizePath(entry.controller) === normalizePath(controller)) &&
      (!needle || normalizePath(entry.path).includes(needle)));
  }

  // Close matches for a path that is not in the catalog
  suggest(path, limit = 5) {
    const [module, controller, command = ''] = path.split('/');
    const sameController = this.list({ module, controller });
    const pool = sameController.length ? sameController : this.list({ module });
    const wanted = normalizePath(command);
    return pool
      .map(entry => ({ entry, score: similarity(wanted, normalizePath(entry.command)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ entry }) => entry.path);
  }
}

// Shared prefix plus shared characters; cheap and good enough for hints
function similarity(a, b) {
  let prefix = 0;
  while (prefix < a.length && a[prefix] === b[prefix]) prefix++;
  const common = [...new Set(a)].filter(ch => b.includes(ch)).length;
  return prefix * 2 + common;
}

// Generic access to every OPNsense API endpoint through the docs catalog.
//
// Every tool gets two extra methods:
//   call      - calls any catalog endpoint: params.path plus its path args
//               by name, the remaining params form the request body
//   endpoints - lists catalog endpoints (default: the tool's own module)
// Modules the typescript client lacks entirely get a tool of their own that
// only offers these generic methods.

import { extractBody } from './call-args.js';

export const CALL_METHOD = 'call';
export const ENDPOINTS_METHOD = 'endpoints';

// Three path segments of letters, digits and underscores; unchecked calls
// may append their own arg segments since the catalog cannot name them
const API_PATH = /^[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+$/i;
const UNCHECKED_PATH = /^[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+(\/[a-z0-9_.:-]+)*$/i;
const CONTROL_KEYS = ['path', 'httpMethod', 'unchecked'];

// API module behind an existing client tool
export function apiModuleOf(tool) {
  if (tool.apiModule) return tool.apiModule;
  if (tool.module === 'firmware') return 'core';
  return tool.submodule ?? tool.module;
}

export function addCatalogMethods(tool) {
  const props = tool.inputSchema.properties;
  const apiModule = apiModuleOf(tool);
  return {
    ...tool,
    apiModule,
    methods: [...tool.methods, CALL_METHOD, ENDPOINTS_METHOD],
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...props,
        method: { ...props.method, enum: [...props.method.enum, CALL_METHOD, ENDPOINTS_METHOD] },
        params: {
          ...props.params,
          properties: {
            ...props.params.properties,
            path: {
              type: 'string',
              description: `For 'call' and 'search': API path below /api, e.g. '${apiModule}/<controller>/<command>' ` +
                "or 'firewall/filter/search_rule'. 'call' takes the endpoint's path args by name (e.g. uuid) and " +
                "sends the other params as body; method 'endpoints' lists valid paths and their args.",
            },
            httpMethod: { type: 'string', enum: ['GET', 'POST'], description: "For 'call': override GET/POST" },
            unchecked: { type: 'boolean', description: "For 'call': allow a path missing from the API catalog" },
            module: { type: 'string', description: `For 'endpoints': API module (default '${apiModule}', '*' = list modules)` },
            controller: { type: 'string', description: "For 'endpoints': only this controller" },
            filter: { type: 'string', description: "For 'endpoints': substring of the path, e.g. 'search'" },
          },
        },
      },
    },
  };
}

// Tools for catalog modules that no client tool covers
export function catalogTools(catalog, tools) {
  const covered = new Set(tools.map(apiModuleOf));
  return catalog.modules()
    .filter(mod => !covered.has(mod.name))
    .map(mod => {
      const plugin = mod.kind === 'plugin';
      const edition = mod.kind === 'business' ? ' (OPNsense Business Edition only)' : '';
      return {
        name: plugin ? `plugin_${mod.name}_manage` : `${mod.name}_manage`,
        description: `${plugin ? 'Plugin ' : ''}${mod.name} management${edition} - ${mod.count} API endpoints ` +
          "via method 'call'; method 'endpoints' lists them",
        module: plugin ? 'plugins' : mod.name,
        ...(plugin ? { submodule: mod.name } : {}),
        apiModule: mod.name,
        methods: [],
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'The method to call on this module', enum: [] },
            params: { type: 'object', description: 'Parameters for the method (varies by method)', properties: {} },
          },
          required: ['method'],
        },
      };
    });
}

// Builds { method, url, body } for a 'call' on a catalog endpoint
export function buildApiRequest(catalog, params = {}) {
  const { path, httpMethod, unchecked } = params;
  if (typeof path !== 'string' || !(unchecked ? UNCHECKED_PATH : API_PATH).test(path)) {
    throw new Error(`Invalid path '${path}': expected <module>/<controller>/<command>, e.g. firewall/alias/search_item`);
  }
  const entry = API_PATH.test(path) ? catalog.find(path) : null;
  if (!entry && !unchecked) {
    const hint = catalog.suggest(path);
    throw new Error(`Unknown API endpoint '${path}'` + (hint.length ? `. Did you mean: ${hint.join(', ')}?` : '') +
      " Use method 'endpoints' to list valid paths, or unchecked: true to call it anyway.");
  }

  const rest = { ...params };
  for (const key of CONTROL_KEYS) delete rest[key];

  // Path args in catalog order; optional ones may only be left off at the end
  const segments = [];
  let skipped = null;
  for (const arg of entry?.params ?? []) {
    const value = rest[arg.name];
    delete rest[arg.name];
    if (value === undefined || value === null) {
      if (!arg.optional) throw new Error(`Missing required path parameter '${arg.name}' for ${entry.path}`);
      skipped ??= arg.name;
      continue;
    }
    if (skipped) throw new Error(`Parameter '${arg.name}' for ${entry.path} needs '${skipped}' as well`);
    segments.push(encodeURIComponent(pathValue(arg.name, value)));
  }

  const body = extractBody(rest);
  const method = chooseMethod(entry, httpMethod, body);
  const url = ['/api', entry?.path ?? path, ...segments].join('/');
  return { method, url, body };
}

function pathValue(name, value) {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  throw new Error(`Path parameter '${name}' must be a string, number or boolean`);
}

// The docs generator lists POST only for actions that check isPost(); a
// plain GET means "no check found", so those actions accept either method.
// Search actions listed as GET still only filter on a POSTed body.
function chooseMethod(entry, httpMethod, body) {
  const postOnly = entry?.methods.length === 1 && entry.methods[0] === 'POST';
  if (httpMethod) {
    const wanted = httpMethod.toUpperCase();
    if (postOnly && wanted !== 'POST') throw new Error(`${entry.path} only accepts POST`);
    return wanted;
  }
  if (postOnly) return 'POST';
  return body === undefined ? 'GET' : 'POST';
}

// Sends a request built by buildApiRequest; GET params become the query string
export function sendApiRequest(http, { method, url, body }) {
  if (method === 'GET') {
    return body === undefined ? http.get(url) : http.get(url, { params: body });
  }
  return http.post(url, body ?? {});
}

// Result of the 'endpoints' method
export function listEndpoints(catalog, tool, params = {}) {
  const module = params.module ?? tool.apiModule;
  if (module === '*') return { modules: catalog.modules() };
  const found = catalog.list({ module, controller: params.controller, filter: params.filter });
  return {
    count: found.length,
    endpoints: found.map(entry => ({
      path: entry.path,
      methods: entry.methods.join(','),
      args: entry.params.map(p => (p.optional ? `${p.name}?` : p.name)).join(', '),
    })),
  };
}

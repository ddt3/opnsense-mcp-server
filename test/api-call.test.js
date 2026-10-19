import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { ApiCatalog, parseRst } from '../lib/api-catalog.js';
import {
  addCatalogMethods,
  apiModuleOf,
  buildApiRequest,
  catalogTools,
  listEndpoints,
  sendApiRequest,
} from '../lib/api-call.js';
import { addSearchMethod } from '../lib/search.js';

const row = (methods, path, params = '') => {
  const [module, controller, command] = path.split('/');
  return `    "\`\`${methods}\`\`","${module}","${controller}","${command}","${params}"`;
};

const catalog = new ApiCatalog([
  ...parseRst([
    row('POST', 'firewall/alias/toggle_item', '$uuid,$enabled=null'),
    row('GET,POST', 'firewall/alias/search_item'),
    row('GET', 'firewall/alias/get_item', '$uuid=null'),
    row('POST', 'firewall/alias/set_item', '$uuid'),
    row('GET', 'core/firmware/status'),
  ].join('\n'), 'core'),
  ...parseRst(row('GET,POST', 'radvd/settings/search_entry'), 'core'),
  ...parseRst(row('GET', 'netbird/service/status'), 'plugin'),
  ...parseRst(row('GET', 'opncentral/hosts/search'), 'business'),
]);

test('call fills path args by name and sends the rest as body', () => {
  assert.deepEqual(
    buildApiRequest(catalog, { path: 'firewall/alias/set_item', uuid: 'abc', item: { alias: { name: 'x' } } }),
    { method: 'POST', url: '/api/firewall/alias/set_item/abc', body: { alias: { name: 'x' } } },
  );
});

test('call encodes path args, converts booleans and allows trailing optional args to be left off', () => {
  assert.equal(buildApiRequest(catalog, { path: 'firewall/alias/toggle_item', uuid: 'a/b', enabled: false }).url,
    '/api/firewall/alias/toggle_item/a%2Fb/0');
  assert.equal(buildApiRequest(catalog, { path: 'firewall/alias/toggle_item', uuid: 'u' }).url,
    '/api/firewall/alias/toggle_item/u');
  assert.equal(buildApiRequest(catalog, { path: 'firewall/alias/get_item' }).url, '/api/firewall/alias/get_item');
});

test('call rejects missing required args and unknown endpoints with suggestions', () => {
  assert.throws(() => buildApiRequest(catalog, { path: 'firewall/alias/set_item' }), /Missing required path parameter 'uuid'/);
  assert.throws(() => buildApiRequest(catalog, { path: 'firewall/alias/toggle' }), /Did you mean: firewall\/alias\/toggle_item/);
  assert.throws(() => buildApiRequest(catalog, { path: '../../etc' }), /Invalid path/);
  assert.throws(() => buildApiRequest(catalog, { path: 'firewall/alias/x/extra' }), /Invalid path/);
});

test('call POSTs a body, GETs without one, and enforces POST-only endpoints', () => {
  assert.equal(buildApiRequest(catalog, { path: 'core/firmware/status' }).method, 'GET');
  assert.equal(buildApiRequest(catalog, { path: 'firewall/alias/search_item' }).method, 'GET');
  assert.equal(buildApiRequest(catalog, { path: 'firewall/alias/search_item', rowCount: -1 }).method, 'POST');
  // Docs "GET" only means no isPost() check, so a body still goes as POST
  assert.equal(buildApiRequest(catalog, { path: 'core/firmware/status', searchPhrase: 'x' }).method, 'POST');
  assert.equal(buildApiRequest(catalog, { path: 'core/firmware/status', httpMethod: 'post' }).method, 'POST');
  assert.equal(buildApiRequest(catalog, { path: 'firewall/alias/toggle_item', uuid: 'u' }).method, 'POST');
  assert.throws(() => buildApiRequest(catalog, { path: 'firewall/alias/set_item', uuid: 'u', httpMethod: 'GET' }), /only accepts POST/);
});

test('unchecked calls bypass the catalog and may carry their own arg segments', () => {
  assert.deepEqual(
    buildApiRequest(catalog, { path: 'firewall/alias/brand_new/abc-1', unchecked: true, httpMethod: 'POST' }),
    { method: 'POST', url: '/api/firewall/alias/brand_new/abc-1', body: undefined },
  );
  assert.equal(buildApiRequest(catalog, { path: 'x/y/z', unchecked: true }).method, 'GET');
});

test('sendApiRequest uses GET query params and POST bodies', async () => {
  const calls = [];
  const http = {
    get: async (...a) => calls.push(['get', ...a]),
    post: async (...a) => calls.push(['post', ...a]),
  };
  await sendApiRequest(http, { method: 'GET', url: '/api/a/b/c', body: undefined });
  await sendApiRequest(http, { method: 'GET', url: '/api/a/b/c', body: { q: 1 } });
  await sendApiRequest(http, { method: 'POST', url: '/api/a/b/c', body: undefined });
  assert.deepEqual(calls, [
    ['get', '/api/a/b/c'],
    ['get', '/api/a/b/c', { params: { q: 1 } }],
    ['post', '/api/a/b/c', {}],
  ]);
});

test('catalogTools adds tools only for modules without a client tool', () => {
  const clientTools = [{ module: 'firewall' }, { module: 'firmware' }];
  const tools = catalogTools(catalog, clientTools);
  assert.deepEqual(tools.map(t => [t.name, t.module, t.submodule]), [
    ['radvd_manage', 'radvd', undefined],
    ['plugin_netbird_manage', 'plugins', 'netbird'],
    ['opncentral_manage', 'opncentral', undefined],
  ]);
  assert.match(tools[2].description, /Business Edition/);
  assert.equal(apiModuleOf({ module: 'firmware' }), 'core');
  assert.equal(apiModuleOf({ module: 'plugins', submodule: 'haproxy' }), 'haproxy');
});

test('every tool gets search, call and endpoints in its method enum', () => {
  const [tool] = catalogTools(catalog, []).map(addSearchMethod).map(addCatalogMethods);
  assert.deepEqual(tool.methods, ['search', 'call', 'endpoints']);
  assert.deepEqual(tool.inputSchema.properties.method.enum, ['search', 'call', 'endpoints']);
  assert.ok(tool.inputSchema.properties.params.properties.httpMethod);
});

test('endpoints lists the tool module by default, or all modules with *', () => {
  const tool = { apiModule: 'firewall' };
  const res = listEndpoints(catalog, tool, { filter: 'toggle' });
  assert.deepEqual(res, { count: 1, endpoints: [{ path: 'firewall/alias/toggle_item', methods: 'POST', args: 'uuid, enabled?' }] });
  assert.equal(listEndpoints(catalog, tool, {}).count, 4);
  assert.equal(listEndpoints(catalog, tool, { module: '*' }).modules.length, 5);
});

test('the build template wires call and endpoints into the server', () => {
  const src = readFileSync(new URL('../src/build.ts', import.meta.url), 'utf8');
  const built = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  for (const code of [src, built]) {
    assert.match(code, /args\.method === CALL_METHOD/);
    assert.match(code, /args\.method === ENDPOINTS_METHOD/);
    assert.match(code, /catalogTools\(API_CATALOG, CLIENT_TOOLS\)/);
  }
});

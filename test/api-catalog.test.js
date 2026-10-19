import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiCatalog, normalizePath, parseParams, parseRst } from '../lib/api-catalog.js';

const RST = `
.. csv-table:: Resources (AliasController.php)  -- extends : ApiMutableModelControllerBase
   :header: "Method", "Module", "Controller", "Command", "Parameters"
   :widths: 4, 15, 15, 30, 40

    "\`\`POST\`\`","firewall","alias","add_item",""
    "\`\`GET,POST\`\`","firewall","alias","search_item",""
    "\`\`POST\`\`","firewall","alias","toggle_item","$uuid,$enabled=null"

    "\`\`<<uses>>\`\`", "", "", "", "*model* \`Alias.xml <https://example>\`__"

.. csv-table:: Resources (AliasUtilController.php)  -- extends : ApiControllerBase
    "\`\`GET\`\`","firewall","alias_util","list","$alias"
`;

test('parseParams reads required, optional and quoted defaults', () => {
  assert.deepEqual(parseParams(''), []);
  assert.deepEqual(parseParams('$uuid'), [{ name: 'uuid', optional: false }]);
  assert.deepEqual(parseParams("$uuid,$enabled=null,$fmt='json'"), [
    { name: 'uuid', optional: false },
    { name: 'enabled', optional: true, default: 'null' },
    { name: 'fmt', optional: true, default: 'json' },
  ]);
});

test('parseRst extracts endpoint rows with methods, params and source controller', () => {
  const entries = parseRst(RST, 'core');
  assert.deepEqual(entries.map(e => e.path), [
    'firewall/alias/add_item', 'firewall/alias/search_item', 'firewall/alias/toggle_item', 'firewall/alias_util/list',
  ]);
  assert.deepEqual(entries[1].methods, ['GET', 'POST']);
  assert.equal(entries[2].params[1].name, 'enabled');
  assert.equal(entries[2].source, 'AliasController.php');
  assert.equal(entries[3].source, 'AliasUtilController.php');
  assert.ok(entries.every(e => e.kind === 'core'));
});

test('normalizePath ignores case and underscores like the OPNsense router', () => {
  assert.equal(normalizePath('proxy/settings/add_p_a_c_match'), normalizePath('Proxy/Settings/addPacMatch'));
  assert.equal(normalizePath('firewall/alias_util/list'), 'firewall/aliasutil/list');
});

test('ApiCatalog finds, lists and suggests endpoints', () => {
  const catalog = new ApiCatalog(parseRst(RST, 'core'));
  assert.equal(catalog.find('firewall/alias/toggleItem').path, 'firewall/alias/toggle_item');
  assert.equal(catalog.find('firewall/alias/nope'), null);
  assert.equal(catalog.list({ module: 'firewall', controller: 'aliasUtil' }).length, 1);
  assert.equal(catalog.list({ filter: 'search' }).length, 1);
  assert.equal(catalog.suggest('firewall/alias/toggle')[0], 'firewall/alias/toggle_item');
  assert.deepEqual(catalog.modules(), [{ name: 'firewall', kind: 'core', count: 4 }]);
});

test('the shipped catalog covers core and plugin modules', () => {
  const catalog = ApiCatalog.load();
  assert.ok(catalog.entries.length > 2000, `only ${catalog.entries.length} endpoints`);
  for (const path of ['firewall/filter/search_rule', 'radvd/settings/search_entry', 'core/firmware/status', 'haproxy/settings/search_servers']) {
    assert.ok(catalog.find(path), `${path} missing from catalog`);
  }
  assert.equal(catalog.byPath.size, catalog.entries.length, 'normalized paths must be unique');
});

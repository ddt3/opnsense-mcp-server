import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPNsenseClient } from '@richard-stovall/opnsense-typescript-client';
import { getParamNames, buildCallArgs } from '../lib/call-args.js';

const client = new OPNsenseClient({ baseUrl: 'http://127.0.0.1:9', apiKey: 'k', apiSecret: 's' });

// Collect every client method as [label, fn] across core modules and plugins
function allMethods() {
  const modules = [];
  for (const [name, mod] of Object.entries(client)) {
    if (!mod || typeof mod !== 'object' || name === 'http') continue;
    if (name === 'plugins') {
      for (const [pname, pmod] of Object.entries(mod)) modules.push([`plugins.${pname}`, pmod]);
    } else {
      modules.push([name, mod]);
    }
  }
  const methods = [];
  for (const [modName, mod] of modules) {
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(mod))) {
      if (key !== 'constructor' && typeof mod[key] === 'function') methods.push([`${modName}.${key}`, mod[key]]);
    }
  }
  return methods;
}

test('getParamNames reads positional parameters of real client methods', () => {
  assert.deepEqual(getParamNames(client.firewall.aliasDelItem), ['uuid', 'data', 'config']);
  assert.deepEqual(getParamNames(client.core.backupBackups), ['host', 'config']);
  assert.deepEqual(getParamNames(client.core.backupDiff), ['host', 'backup1', 'backup2', 'config']);
  assert.deepEqual(getParamNames(client.core.systemStatus), ['config']);
});

test('every client method parses, with config last and data never before a path arg', () => {
  const methods = allMethods();
  assert.ok(methods.length > 1900, `expected >1900 methods, got ${methods.length}`);
  for (const [label, fn] of methods) {
    const names = getParamNames(fn);
    assert.equal(names.at(-1), 'config', `${label}: config is not last (${names})`);
    const dataIdx = names.indexOf('data');
    if (dataIdx !== -1) assert.equal(dataIdx, names.length - 2, `${label}: data not just before config (${names})`);
  }
});

test('path arg goes into the URL slot, remaining keys become the body', () => {
  const args = buildCallArgs(client.firewall.aliasDelItem, { uuid: 'abc' });
  assert.deepEqual(args, ['abc', undefined]);

  const set = buildCallArgs(client.firewall.aliasSetItem, { uuid: 'abc', alias: { name: 'x' } });
  assert.deepEqual(set, ['abc', { alias: { name: 'x' } }]);
});

test('data-only methods: params is the body, data/item wrappers are unwrapped', () => {
  const body = { alias: { name: 'x' } };
  assert.deepEqual(buildCallArgs(client.firewall.aliasAddItem, body), [body]);
  assert.deepEqual(buildCallArgs(client.firewall.aliasAddItem, { data: body }), [body]);
  assert.deepEqual(buildCallArgs(client.firewall.aliasAddItem, { item: body }), [body]);
});

test('config-only methods get no arguments', () => {
  assert.deepEqual(buildCallArgs(client.core.systemStatus, {}), []);
  assert.deepEqual(buildCallArgs(client.core.systemStatus, { searchPhrase: 'x' }), []);
});

test('missing or non-scalar path arg throws a clear error', () => {
  assert.throws(() => buildCallArgs(client.firewall.aliasDelItem, {}), /Missing required parameter 'uuid'/);
  assert.throws(() => buildCallArgs(client.firewall.aliasToggleItem, { uuid: 'abc' }), /Missing required parameter 'enabled'/);
  assert.throws(() => buildCallArgs(client.firewall.aliasDelItem, { uuid: { a: 1 } }), /must be a string or number/);
});

test('path args are URL-encoded', () => {
  assert.deepEqual(buildCallArgs(client.core.backupBackups, { host: 'a/b' }), ['a%2Fb']);
  assert.deepEqual(buildCallArgs(client.core.backupBackups, { host: '../x' }), ['..%2Fx']);
  assert.deepEqual(buildCallArgs(client.firewall.aliasToggleItem, { uuid: 'abc', enabled: 1 }), ['abc', '1', undefined]);
});

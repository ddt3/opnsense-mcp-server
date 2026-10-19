import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPNsenseClient } from '@richard-stovall/opnsense-typescript-client';
import { ApiCatalog } from '../lib/api-catalog.js';
import { endpointOf, staleMethodError } from '../lib/stale-methods.js';

const client = new OPNsenseClient({ baseUrl: 'http://127.0.0.1:9', apiKey: 'k', apiSecret: 's' });
const catalog = ApiCatalog.load();

test('endpointOf reads the endpoint from the method source, after URL fixes', () => {
  assert.equal(endpointOf(client.firewall.aliasDelItem), 'firewall/alias/del_item');
  assert.equal(endpointOf(client.firewall.filterBaseApply), 'firewall/filter/apply');
  assert.equal(endpointOf(client.firmware.firmwareStatus), 'core/firmware/status');
  assert.equal(endpointOf(function noUrl() {}), null);
});

test('methods for removed endpoints are stale, with a pointer to current ones', () => {
  const error = staleMethodError(catalog, client.firewall.filterBaseSavepoint);
  assert.match(error, /filterBaseSavepoint calls \/api\/firewall\/filter\/savepoint, which is not in the OPNsense API anymore/);
  assert.match(error, /method 'call'/);
  assert.match(staleMethodError(catalog, client.plugins.crowdsec.alertsGet), /crowdsec\/alerts\/search/);
});

test('working methods are not stale, including inherited actions the docs miss', () => {
  for (const fn of [
    client.firewall.aliasDelItem,
    client.firewall.filterBaseApply,
    client.firewall.filterBaseGet,
    client.kea.leases4Search,
    client.plugins.quagga.bgpGet,
    client.firmware.firmwareStatus,
  ]) {
    assert.equal(staleMethodError(catalog, fn), null, `${fn.name} wrongly flagged`);
  }
});

test('only a small number of client methods are stale', () => {
  let stale = 0;
  const modules = Object.entries(client)
    .filter(([name, mod]) => mod && typeof mod === 'object' && name !== 'http' && name !== 'plugins')
    .concat(Object.entries(client.plugins));
  for (const [, mod] of modules) {
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(mod))) {
      if (key !== 'constructor' && staleMethodError(catalog, mod[key])) stale++;
    }
  }
  assert.ok(stale > 0 && stale < 60, `${stale} stale methods`);
});

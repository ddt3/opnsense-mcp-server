import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllerEndpoints, parseController, snakeCase } from '../lib/php-controllers.js';

const BASE = '/src/opnsense/mvc/app/controllers/OPNsense';

const MODEL_BASE = `<?php
namespace OPNsense\\Base;
abstract class ApiMutableModelControllerBase extends ApiControllerBase
{
    public function getAction()
    {
        return [];
    }

    public function setAction()
    {
        if ($this->request->isPost()) {
        }
    }
}`;

const FILTER_BASE = `<?php
namespace OPNsense\\Firewall\\Api;
use OPNsense\\Base\\ApiMutableModelControllerBase;
abstract class FilterBaseController extends ApiMutableModelControllerBase
{
    public function applyAction()
    {
        if ($this->request->isPost()) {
            return [];
        }
    }

    public function listCategoriesAction()
    {
        return [];
    }
}`;

const FILTER = `<?php
namespace OPNsense\\Firewall\\Api;
class FilterController extends FilterBaseController
{
    public function searchRuleAction()
    {
        return $this->searchBase('rules.rule');
    }

    public function toggleRuleAction($uuid, $enabled = null)
    {
        return $this->toggleBase('rules.rule', $uuid, $enabled);
    }

    public function listCategoriesAction()
    {
        return ['own'];
    }

    private function helper()
    {
        $this->request->isPost();
    }
}`;

const classes = [
  parseController(MODEL_BASE, `/core${BASE}/Base/ApiMutableModelControllerBase.php`),
  parseController(FILTER_BASE, `/core${BASE}/Firewall/Api/FilterBaseController.php`),
  parseController(FILTER, `/core${BASE}/Firewall/Api/FilterController.php`),
];

test('snakeCase follows the docs naming of actions and controllers', () => {
  assert.equal(snakeCase('searchItem'), 'search_item');
  assert.equal(snakeCase('OneToOne'), 'one_to_one');
  assert.equal(snakeCase('getAliasUUID'), 'get_alias_u_u_i_d');
});

test('parseController resolves parents through use statements and the namespace', () => {
  const [base, filterBase, filter] = classes;
  assert.equal(base.abstract, true);
  assert.equal(filterBase.parent, 'OPNsense\\Base\\ApiMutableModelControllerBase');
  assert.equal(filter.parent, 'OPNsense\\Firewall\\Api\\FilterBaseController');
  assert.equal(filterBase.route, null, 'abstract classes are not routable');
  assert.deepEqual(filter.route, { module: 'firewall', controller: 'filter' });
});

test('parseController reads action params and detects POST like the docs generator', () => {
  const actions = Object.fromEntries(classes[2].actions.map(a => [a.name, a]));
  assert.deepEqual(actions.toggleRule.params, [
    { name: 'uuid', optional: false },
    { name: 'enabled', optional: true, default: 'null' },
  ]);
  assert.deepEqual(actions.toggleRule.methods, ['POST']);
  assert.deepEqual(actions.searchRule.methods, ['GET', 'POST']);
  // isPost() in a later private function must not leak into this action
  assert.deepEqual(actions.listCategories.methods, ['GET']);
  assert.ok(!('helper' in actions));
});

test('controllerEndpoints adds inherited actions and lets subclasses override them', () => {
  const endpoints = controllerEndpoints(classes, () => 'core');
  const byPath = Object.fromEntries(endpoints.map(e => [e.path, e]));
  assert.deepEqual(Object.keys(byPath).sort(), [
    'firewall/filter/apply',
    'firewall/filter/get',
    'firewall/filter/list_categories',
    'firewall/filter/search_rule',
    'firewall/filter/set',
    'firewall/filter/toggle_rule',
  ]);
  assert.deepEqual(byPath['firewall/filter/apply'].methods, ['POST']);
  assert.match(byPath['firewall/filter/apply'].source, /inherited from FilterBaseController/);
  assert.equal(byPath['firewall/filter/list_categories'].source, 'FilterController.php');
  assert.deepEqual(byPath['firewall/filter/set'].methods, ['POST']);
});

// Corrects wrong endpoint URLs in the typescript client.
//
// The client's firmware module calls /api/firmware/firmware/*, but OPNsense
// serves the firmware controller under /api/core/firmware/*, so every
// firmware_manage method returned 404. Likewise the filterBase* methods call
// /api/firewall/filter_base/*, an abstract base controller that OPNsense
// exposes through /api/firewall/filter/*. The client modules share one http
// object, so patching its verbs fixes all of them in one place.

const URL_FIXES = [
  ['/api/firmware/firmware/', '/api/core/firmware/'],
  ['/api/firewall/filter_base/', '/api/firewall/filter/'],
];

// Endpoints the client still knows but current OPNsense has removed.
// Calling them would only return a bare 404, so fail with an explanation.
const REMOVED_ENDPOINTS = [
  ['/api/firewall/filter/savepoint', 'firewall savepoints were removed from OPNsense; filterBaseApply now applies without rollback'],
  ['/api/firewall/filter/cancel_rollback/', 'firewall rollback was removed from OPNsense; filterBaseApply now applies without rollback'],
  ['/api/firewall/filter/revert/', 'firewall revert was removed from OPNsense; restore a config backup instead'],
];

const VERBS = ['get', 'post', 'put', 'delete', 'patch'];
const PATCHED = Symbol('urlFixesPatched');

export function fixUrl(url) {
  for (const [from, to] of URL_FIXES) {
    if (url.startsWith(from)) return to + url.slice(from.length);
  }
  return url;
}

export function removedEndpointReason(url) {
  for (const [prefix, reason] of REMOVED_ENDPOINTS) {
    if (url.startsWith(prefix)) return reason;
  }
  return null;
}

export function patchHttpClient(http) {
  if (http[PATCHED]) return http;
  for (const verb of VERBS) {
    const original = http[verb];
    if (typeof original !== 'function') continue;
    http[verb] = function (url, ...rest) {
      const fixed = fixUrl(url);
      const reason = removedEndpointReason(fixed);
      if (reason) {
        return Promise.reject(new Error(`${fixed}: ${reason}`));
      }
      return original.call(this, fixed, ...rest);
    };
  }
  http[PATCHED] = true;
  return http;
}

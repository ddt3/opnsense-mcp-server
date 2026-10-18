// Corrects wrong endpoint URLs in the typescript client.
//
// The client's firmware module calls /api/firmware/firmware/*, but OPNsense
// serves the firmware controller under /api/core/firmware/*, so every
// firmware_manage method returned 404. The client modules share one http
// object, so patching its verbs fixes all of them in one place.

const URL_FIXES = [
  ['/api/firmware/firmware/', '/api/core/firmware/'],
];

const VERBS = ['get', 'post', 'put', 'delete', 'patch'];
const PATCHED = Symbol('urlFixesPatched');

export function fixUrl(url) {
  for (const [from, to] of URL_FIXES) {
    if (url.startsWith(from)) return to + url.slice(from.length);
  }
  return url;
}

export function patchHttpClient(http) {
  if (http[PATCHED]) return http;
  for (const verb of VERBS) {
    const original = http[verb];
    if (typeof original !== 'function') continue;
    http[verb] = function (url, ...rest) {
      return original.call(this, fixUrl(url), ...rest);
    };
  }
  http[PATCHED] = true;
  return http;
}

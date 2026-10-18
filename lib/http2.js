// Talk HTTP/2 to OPNsense instead of HTTP/1.1.
//
// Large API responses (e.g. core/firmware/info, haproxy/settings/get) come
// back from OPNsense over HTTP/1.1 with broken chunked framing: a chunk
// carries more bytes than its declared size, and Node aborts with
// "Parse Error: Expected LF after chunk data". HTTP/2 has no chunked
// encoding, so those responses parse fine.
//
// axios supports HTTP/2 natively (httpVersion: 2), but its HTTP/2 transport
// ignores the `auth` option and the httpsAgent, so basic auth becomes an
// explicit header and the TLS setting moves into http2Options.

const ENV_HINT = "OPNSENSE_HTTP_VERSION must be '1' or '2'";

export function resolveHttpVersion(url, envValue) {
  // HTTP/2 is only offered over TLS (ALPN); keep plain http on HTTP/1.1
  if (!/^https:/i.test(url)) return 1;
  if (envValue === undefined || envValue === '') return 2;
  if (envValue === '1' || envValue === '1.1') return 1;
  if (envValue === '2') return 2;
  throw new Error(`${ENV_HINT}, got '${envValue}'`);
}

export function enableHttp2(http, { verifySsl }) {
  const defaults = http.client.defaults;
  const { username, password } = defaults.auth;
  defaults.headers.common.Authorization =
    'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  delete defaults.auth;
  defaults.httpVersion = 2;
  defaults.http2Options = {
    rejectUnauthorized: verifySsl !== false,
    // Reuse one session for bursts of calls, drop it when idle
    sessionTimeout: 10000,
  };
  return http;
}

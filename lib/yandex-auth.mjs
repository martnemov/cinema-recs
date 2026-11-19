import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const callback = 'https://martnemov-cinema-private.vercel.app/api/yandex-callback';
const origin = new URL(callback).origin;
const flowCookie = '__Host-next-frame-oauth';
const sessionCookie = '__Host-next-frame-session';
const flowLifetime = 600;
const sessionLifetime = 43200;

const clientId = () => process.env.YANDEX_CLIENT_ID;
const clientSecret = () => process.env.YANDEX_CLIENT_SECRET;
const sessionSecret = () => process.env.AUTH_SESSION_SECRET;
const random = () => randomBytes(32).toString('base64url');

function sign(body, purpose) {
  return createHmac('sha256', sessionSecret()).update(purpose + '.' + body).digest();
}

function seal(payload, purpose, lifetime) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + lifetime * 1000 })).toString('base64url');
  return body + '.' + sign(body, purpose).toString('base64url');
}

function read(request, name, purpose) {
  if (!sessionSecret()) return null;
  const entry = request.headers.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='));
  const [body, signature, extra] = entry?.slice(name.length + 1).split('.') ?? [];
  if (!body || !signature || extra !== undefined) return null;
  try {
    const actual = Buffer.from(signature, 'base64url');
    const wanted = sign(body, purpose);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function cookie(name, value, age) {
  return name + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + age;
}

export function readSession(request) {
  return read(request, sessionCookie, 'session');
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function configured() {
  return Boolean(clientId() && clientSecret() && sessionSecret());
}

export function start(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  if (!configured()) return redirect('/?auth=unavailable');
  if (new URL(request.url).origin !== origin) return redirect(origin + '/api/yandex-login');
  const state = random();
  const verifier = random();
  const url = new URL('https://oauth.yandex.ru/authorize');
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId(), redirect_uri: callback,
    scope: 'login:info', state, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return redirect(url.href, [cookie(flowCookie, seal({ state, verifier }, 'flow', flowLifetime), flowLifetime)]);
}

export async function finish(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const clearFlow = cookie(flowCookie, '', 0);
  const failed = () => redirect('/?auth=failed', [clearFlow]);
  const url = new URL(request.url);
  if (!configured() || url.origin !== origin) return failed();
  const flow = read(request, flowCookie, 'flow');
  const code = url.searchParams.get('code');
  if (!flow || !code || url.searchParams.get('state') !== flow.state) return failed();
  try {
    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, client_id: clientId(),
        client_secret: clientSecret(), redirect_uri: callback, code_verifier: flow.verifier,
      }),
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) return failed();
    const token = (await tokenResponse.json()).access_token;
    if (typeof token !== 'string' || !token) return failed();
    const profileResponse = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: 'OAuth ' + token }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!profileResponse.ok) return failed();
    const { id, login, real_name, display_name } = await profileResponse.json();
    if (typeof id !== 'string' || !id || typeof login !== 'string' || !login) return failed();
    const name = [real_name, display_name].find(value => typeof value === 'string' && value.trim())?.trim().slice(0, 120) || login;
    return redirect('/', [clearFlow, cookie(sessionCookie, seal({ id, login, name }, 'session', sessionLifetime), sessionLifetime)]);
  } catch {
    return failed();
  }
}

export function session(request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
    return redirect('/', [cookie(sessionCookie, '', 0), cookie(flowCookie, '', 0)]);
  }
  if (request.method !== 'GET') return new Response(null, { status: 405, headers });
  const user = readSession(request);
  return Response.json(user ? { id: user.id, login: user.login, name: user.name || user.login } : null, { headers, status: user ? 200 : 401 });
}

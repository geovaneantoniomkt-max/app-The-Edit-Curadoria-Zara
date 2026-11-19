// Worker do dashboard da The Edit.
// - /login (GET/POST), /logout: autenticação por senha única
// - /api/report, /api/ads, /api/breakdown: dados da Meta (somente leitura)
// - demais rotas: arquivos estáticos de ./public (somente com sessão válida)

import { handleLogin, handleLogout, isAuthenticated } from './auth.js';
import { MetaError } from './meta.js';
import { InputError, buildAds, buildBreakdown, buildReport, parseRange } from './report.js';

const PUBLIC_FILES = new Set(['/styles.css', '/favicon.svg', '/login.js']);
const PRIVATE_FILES = new Set(['/app.js']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
};

function withSecurityHeaders(response) {
  const res = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(key, value);
  return res;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
}

async function serveAsset(env, request, path) {
  const assetUrl = new URL(path, request.url);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }));
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', path.endsWith('.html') ? 'no-store' : 'no-cache');
  return out;
}

function missingConfig(env) {
  return ['META_ACCESS_TOKEN', 'DASHBOARD_PASSWORD', 'SESSION_SECRET'].filter((key) => !env[key]);
}

async function handleApi(request, env, url) {
  if (request.method !== 'GET') return json({ error: { message: 'Método não permitido' } }, 405);
  const refresh = url.searchParams.get('refresh') === '1';
  const range = parseRange(url);

  switch (url.pathname) {
    case '/api/report':
      return json(await buildReport(env, range, { refresh }));
    case '/api/ads':
      return json(await buildAds(env, range, { refresh }));
    case '/api/breakdown':
      return json(await buildBreakdown(env, range, url.searchParams.get('dim'), url.searchParams.get('scope') || 'all', { refresh }));
    default:
      return json({ error: { message: 'Rota não encontrada' } }, 404);
  }
}

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === '/healthz') return text('ok');

  const missing = missingConfig(env);
  if (missing.length) {
    return text(`Configuração incompleta: defina os secrets ${missing.join(', ')} no Worker (veja o README).`, 500);
  }

  if (PUBLIC_FILES.has(pathname) && request.method === 'GET') return serveAsset(env, request, pathname);

  if (pathname === '/login') {
    if (request.method === 'POST') return handleLogin(request, env);
    if (await isAuthenticated(request, env)) return redirect('/');
    return serveAsset(env, request, '/login.html');
  }
  if (pathname === '/logout') return handleLogout();

  const authed = await isAuthenticated(request, env);
  if (pathname.startsWith('/api/')) {
    if (!authed) return json({ error: { message: 'Sessão expirada. Entre novamente.', code: 'unauthorized' } }, 401);
    return handleApi(request, env, url);
  }
  if (!authed) return redirect('/login');

  if (pathname === '/' || pathname === '/index.html') return serveAsset(env, request, '/index.html');
  if (PRIVATE_FILES.has(pathname)) return serveAsset(env, request, pathname);
  return text('Página não encontrada', 404);
}

export default {
  async fetch(request, env) {
    try {
      return withSecurityHeaders(await route(request, env));
    } catch (err) {
      if (err instanceof InputError) return withSecurityHeaders(json({ error: { message: err.message } }, 400));
      if (err instanceof MetaError) {
        console.error('MetaError', err.code, err.subcode, err.message, err.traceId);
        return withSecurityHeaders(json({ error: { message: err.friendly(), code: err.code, trace: err.traceId || null } }, 502));
      }
      console.error('Unhandled', err && err.stack ? err.stack : err);
      return withSecurityHeaders(json({ error: { message: 'Erro interno no dashboard.' } }, 500));
    }
  },
};

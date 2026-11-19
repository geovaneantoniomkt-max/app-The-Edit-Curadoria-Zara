// Autenticação por senha única (DASHBOARD_PASSWORD) com cookie de sessão
// assinado via HMAC-SHA256 (SESSION_SECRET). Trocar a senha invalida todas
// as sessões abertas, porque o hash da senha entra na assinatura.

const COOKIE_NAME = 'te_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias
const encoder = new TextEncoder();

function base64url(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  return crypto.subtle.digest('SHA-256', encoder.encode(value));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

// Compara em tempo constante (os digests têm sempre o mesmo tamanho).
async function safeEqual(a, b) {
  const [da, db] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  return crypto.subtle.timingSafeEqual(da, db);
}

async function signature(env, exp) {
  const passwordHash = base64url(await sha256(env.DASHBOARD_PASSWORD));
  return hmac(env.SESSION_SECRET, `v1|${exp}|${passwordHash}`);
}

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

export async function isAuthenticated(request, env) {
  const raw = parseCookies(request.headers.get('Cookie') || '')[COOKIE_NAME];
  if (!raw) return false;
  const [version, expText, sig] = raw.split('.');
  if (version !== 'v1' || !/^\d{1,12}$/.test(expText || '') || !sig) return false;
  const exp = Number(expText);
  if (exp * 1000 < Date.now()) return false;
  return safeEqual(sig, await signature(env, exp));
}

async function sessionCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await signature(env, exp);
  return `${COOKIE_NAME}=v1.${exp}.${sig}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handleLogin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null' && new URL(origin).host !== new URL(request.url).host) {
    return new Response('Origem inválida', { status: 403 });
  }

  let password = '';
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData();
    password = String(form.get('password') || '');
  }

  const ok = password.length > 0 && (await safeEqual(password, env.DASHBOARD_PASSWORD));
  if (!ok) {
    await sleep(900); // freia tentativas de força bruta
    return new Response(null, { status: 303, headers: { Location: '/login?erro=1' } });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Set-Cookie': await sessionCookie(env) },
  });
}

export function handleLogout() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/login', 'Set-Cookie': clearCookie() },
  });
}

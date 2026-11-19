// Cliente mínimo da Graph API da Meta (Marketing API), com paginação e cache.
// O token nunca sai do Worker: ele só é anexado na chamada para a Meta.

export class MetaError extends Error {
  constructor(error = {}, status = 502) {
    super(error.error_user_msg || error.message || 'Erro desconhecido na API da Meta');
    this.name = 'MetaError';
    this.status = status;
    this.code = error.code;
    this.subcode = error.error_subcode;
    this.type = error.type;
    this.traceId = error.fbtrace_id;
  }

  // Mensagem amigável em português para mostrar no painel.
  friendly() {
    const code = Number(this.code);
    if (code === 190 || code === 102) {
      return 'O token da Meta expirou ou é inválido. Gere um novo token (de preferência de Usuário do Sistema, que não expira) e atualize o secret META_ACCESS_TOKEN no GitHub.';
    }
    if ([4, 17, 32, 613, 80000, 80003, 80004].includes(code)) {
      return 'A Meta limitou o número de consultas no momento. Aguarde alguns minutos e clique em Atualizar.';
    }
    if (code === 10 || code === 200 || (code >= 200 && code < 300)) {
      return 'O token da Meta não tem permissão para ler esta conta de anúncios (precisa da permissão ads_read e acesso à conta).';
    }
    if (code === 100 && /does not exist|cannot be loaded|missing permissions/i.test(this.message)) {
      return 'A conta de anúncios configurada não foi encontrada ou o token não tem acesso a ela. Verifique META_AD_ACCOUNT_ID e as permissões do token.';
    }
    return `Erro da API da Meta: ${this.message}`;
  }
}

const memoryCache = new Map();
const MAX_CACHE_ENTRIES = 300;

function cacheGet(key) {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value, ttlSeconds) {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
  memoryCache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

function serialize(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createMetaClient(env, { refresh = false } = {}) {
  const base = String(env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/+$/, '');
  const baseOrigin = new URL(base).origin;
  const version = env.META_API_VERSION || 'v24.0';
  const token = env.META_ACCESS_TOKEN;
  let proofPromise;

  function appSecretProof() {
    if (!env.META_APP_SECRET) return Promise.resolve(null);
    proofPromise ||= hmacHex(env.META_APP_SECRET, token);
    return proofPromise;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new MetaError({ message: `Resposta inválida da Meta (HTTP ${response.status})` }, 502);
    }
    if (body && body.error) throw new MetaError(body.error, response.status >= 400 ? response.status : 502);
    if (!response.ok) throw new MetaError({ message: `HTTP ${response.status}` }, 502);
    return body;
  }

  async function buildUrl(path, params) {
    const url = new URL(`${base}/${version}/${String(path).replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, serialize(value));
    }
    url.searchParams.set('access_token', token);
    const proof = await appSecretProof();
    if (proof) url.searchParams.set('appsecret_proof', proof);
    return url.toString();
  }

  function cacheKey(kind, path, params) {
    const sorted = Object.keys(params || {})
      .sort()
      .map((key) => `${key}=${serialize(params[key])}`)
      .join('&');
    return `${kind}:${version}:${path}?${sorted}`;
  }

  async function cached(key, ttl, loader) {
    if (!refresh) {
      const hit = cacheGet(key);
      if (hit !== undefined) return hit;
    }
    const value = await loader();
    if (ttl > 0) cacheSet(key, value, ttl);
    return value;
  }

  // Um único objeto/edge (sem paginação).
  function get(path, params = {}, ttl = 600) {
    return cached(cacheKey('get', path, params), ttl, async () => fetchJson(await buildUrl(path, params)));
  }

  // Edge paginado: segue paging.next até maxPages.
  function all(path, params = {}, ttl = 600, maxPages = 8) {
    return cached(cacheKey('all', path, params), ttl, async () => {
      let body = await fetchJson(await buildUrl(path, params));
      const rows = [...(body.data || [])];
      let pages = 1;
      while (body.paging && body.paging.next && pages < maxPages) {
        const next = new URL(body.paging.next);
        if (next.origin !== baseOrigin) break; // nunca envia o token para outro host
        body = await fetchJson(next.toString());
        rows.push(...(body.data || []));
        pages += 1;
      }
      return rows;
    });
  }

  return { get, all };
}

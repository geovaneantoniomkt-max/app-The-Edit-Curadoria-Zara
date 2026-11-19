// Servidor FALSO da Graph API da Meta, só para desenvolvimento local.
// Gera dados sintéticos no mesmo formato da Marketing API para testar o
// dashboard sem token real. Uso:
//   node dev/mock-graph.mjs            (porta 9999)
//   META_GRAPH_BASE=http://127.0.0.1:9999 no .dev.vars
// Token "expired" simula um token vencido (erro 190).

import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 9999);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ACCOUNT = '2327717030881984';
const TODAY = new Date().toISOString().slice(0, 10);

const shift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// PRNG determinístico por chave
function rand(key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const STORE_URL = 'https://apps.apple.com/br/app/the-edit/id0000000000';
const campaigns = [
  { id: '120251834007820171', name: '[LS] [TRÁFEGO] [LP] 06/11', objective: 'OUTCOME_TRAFFIC', daily_budget: '1300', status: 'ACTIVE', start: shift(TODAY, -13), end: null, goal: 'LANDING_PAGE_VIEWS', ctr: 0.07, cpm: 11.5 },
  { id: '120251833820340171', name: '[LS] [PROMOÇÃOAPP] [IOS] 06/11', objective: 'OUTCOME_APP_PROMOTION', daily_budget: '1000', status: 'ACTIVE', start: shift(TODAY, -13), end: null, goal: 'APP_INSTALLS', ctr: 0.025, cpm: 34 },
  { id: '120251833202540171', name: '[LS] [TRÁFEGO] [IG] 06/11', objective: 'OUTCOME_TRAFFIC', daily_budget: '1300', status: 'ACTIVE', start: shift(TODAY, -13), end: null, goal: 'PROFILE_VISIT', ctr: 0.05, cpm: 18 },
  { id: '120250690498750171', name: '20260830_Novos_Seguidores', objective: 'OUTCOME_TRAFFIC', daily_budget: '800', status: 'PAUSED', start: shift(TODAY, -80), end: shift(TODAY, -20), goal: 'VISIT_INSTAGRAM_PROFILE', ctr: 0.045, cpm: 15 },
  { id: '120250900812170171', name: 'Post do Instagram: Se vocês salvaram, é porque...', objective: 'LINK_CLICKS', daily_budget: null, status: 'PAUSED', start: shift(TODAY, -45), end: shift(TODAY, -38), goal: 'PROFILE_VISIT', ctr: 0.04, cpm: 14, adsetBudget: '600' },
  { id: '120250884568000171', name: 'Post do Instagram: Se você viveu a moda dos anos...', objective: 'LINK_CLICKS', daily_budget: null, status: 'PAUSED', start: shift(TODAY, -36), end: shift(TODAY, -30), goal: 'POST_ENGAGEMENT', ctr: 0.02, cpm: 9, adsetBudget: '500' },
];
for (let i = 0; i < 18; i += 1) {
  campaigns.push({ id: `1202400000000${String(i).padStart(5, '0')}`, name: `Post do Instagram: publicação antiga ${i + 1}`, objective: 'LINK_CLICKS', daily_budget: null, status: 'PAUSED', start: shift(TODAY, -300 - i * 5), end: shift(TODAY, -295 - i * 5), goal: 'PROFILE_VISIT', ctr: 0.03, cpm: 10, adsetBudget: '400' });
}

const AUDIENCES = ['[LS] [MODA+MARCAS+COMPORT] [RS/SP/RJ/SC/PR/BH] [MULHERES] [35/55] - Frio', '[LS] [SEM INTERESSE] [RS/SP/RJ/SC/PR/BH] [MULHERES] [35/55] [ADV]'];
const adsets = [];
const ads = [];
for (const c of campaigns) {
  const n = c.status === 'ACTIVE' ? 2 : 1;
  for (let i = 0; i < n; i += 1) {
    const adset = {
      id: `${c.id.slice(0, -2)}${i}1`,
      name: AUDIENCES[i],
      campaign_id: c.id,
      optimization_goal: c.goal,
      destination_type: c.goal === 'APP_INSTALLS' ? 'APP' : c.goal.includes('PROFILE') ? 'INSTAGRAM_PROFILE' : 'UNDEFINED',
      promoted_object: c.goal === 'APP_INSTALLS' ? { application_id: '000000000000000', object_store_url: STORE_URL } : { pixel_id: null },
      status: c.status,
      effective_status: c.status === 'ACTIVE' ? 'ACTIVE' : 'CAMPAIGN_PAUSED',
      daily_budget: c.adsetBudget,
      share: i === 0 ? 0.62 : 0.38,
    };
    adsets.push(adset);
    for (let j = 0; j < 2; j += 1) {
      ads.push({
        id: `${adset.id.slice(0, -1)}${j}9`,
        name: `${['Vídeo', 'Carrossel'][j]} · ${c.name.slice(0, 24)} · ${j + 1}`,
        adset,
        campaign: c,
        share: j === 0 ? 0.7 : 0.3,
        creative_id: `${adset.id.slice(0, -1)}${j}7`,
        color: ['#c9b8a6', '#2f2a26', '#d8cfc4', '#8a6f5a'][(i + j) % 4],
      });
    }
  }
}

function dayMetrics(ad, date) {
  const c = ad.campaign;
  if (date < c.start || (c.end && date > c.end) || date > TODAY) return null;
  const budget = Number(c.daily_budget || c.adsetBudget || 0) / 100;
  const noise = 0.75 + rand(`${ad.id}${date}`) * 0.5;
  const partial = date === TODAY ? 0.55 : 1;
  const spend = budget * ad.adset.share * ad.share * noise * partial;
  const impressions = Math.round((spend / c.cpm) * 1000);
  const clicks = Math.round(impressions * c.ctr * (0.8 + rand(`c${ad.id}${date}`) * 0.4));
  const actions = { link_click: clicks, post_engagement: clicks + Math.round(impressions * 0.01), page_engagement: clicks + Math.round(impressions * 0.012), video_view: Math.round(impressions * 0.22), post_reaction: Math.round(impressions * 0.004), 'onsite_conversion.post_save': Math.round(impressions * 0.002) };
  if (c.goal === 'LANDING_PAGE_VIEWS') {
    actions.landing_page_view = Math.round(clicks * 0.9);
    actions.omni_landing_page_view = actions.landing_page_view;
  }
  if (c.goal === 'APP_INSTALLS') {
    const installs = Math.round(clicks * (0.18 + rand(`i${ad.id}${date}`) * 0.12));
    const reg = Math.round(installs * (0.2 + rand(`r${ad.id}${date}`) * 0.5));
    actions.mobile_app_install = installs;
    actions.omni_app_install = installs;
    actions['app_custom_event.fb_mobile_activate_app'] = Math.round(installs * 1.7);
    actions['app_custom_event.fb_mobile_content_view'] = Math.round(installs * 3.2);
    actions['app_custom_event.fb_mobile_add_to_wishlist'] = Math.round(installs * 0.45);
    actions['app_custom_event.fb_mobile_complete_registration'] = reg;
    actions.omni_complete_registration = reg;
  }
  if (c.goal === 'POST_ENGAGEMENT') actions.post_engagement += Math.round(impressions * 0.03);
  return { spend, impressions, clicks: Math.round(clicks * 1.3), inline_link_clicks: clicks, actions };
}

const BREAKDOWN_SPLITS = {
  age: [['18-24', 0.03], ['25-34', 0.12], ['35-44', 0.41], ['45-54', 0.36], ['55-64', 0.07], ['65+', 0.01]],
  gender: [['female', 0.91], ['male', 0.06], ['unknown', 0.03]],
  publisher_platform: [['instagram', 0.86], ['facebook', 0.12], ['audience_network', 0.02]],
  platform_position: { instagram: [['instagram_reels', 0.46], ['instagram_stories', 0.34], ['feed', 0.15], ['instagram_explore', 0.05]], facebook: [['feed', 0.55], ['facebook_reels', 0.25], ['facebook_stories', 0.2]], audience_network: [['an_classic', 1]] },
  region: [['São Paulo (state)', 0.38], ['Rio de Janeiro (state)', 0.17], ['Minas Gerais', 0.13], ['Rio Grande do Sul', 0.12], ['Paraná', 0.11], ['Santa Catarina', 0.09]],
  impression_device: [['iphone', 0.81], ['android_smartphone', 0.14], ['ipad', 0.04], ['desktop', 0.01]],
};

function splits(breakdowns, row) {
  let out = [{ dims: {}, f: 1 }];
  for (const b of breakdowns) {
    const next = [];
    for (const item of out) {
      let list = BREAKDOWN_SPLITS[b];
      if (b === 'platform_position') list = BREAKDOWN_SPLITS.platform_position[item.dims.publisher_platform] || [['feed', 1]];
      if (b === 'impression_device' && row.campaign.goal === 'APP_INSTALLS') list = [['iphone', 0.93], ['ipad', 0.07]];
      for (const [value, f] of list) next.push({ dims: { ...item.dims, [b]: value }, f: item.f * f });
    }
    out = next;
  }
  return out;
}

function scale(m, f) {
  const actions = {};
  for (const [k, v] of Object.entries(m.actions)) actions[k] = v * f;
  return { spend: m.spend * f, impressions: m.impressions * f, clicks: m.clicks * f, inline_link_clicks: m.inline_link_clicks * f, actions };
}

function add(target, m) {
  target.spend += m.spend;
  target.impressions += m.impressions;
  target.clicks += m.clicks;
  target.inline_link_clicks += m.inline_link_clicks;
  for (const [k, v] of Object.entries(m.actions)) target.actions[k] = (target.actions[k] || 0) + v;
}

function insights(params) {
  const range = JSON.parse(params.get('time_range'));
  const level = params.get('level') || 'account';
  const increment = params.get('time_increment');
  const breakdowns = (params.get('breakdowns') || '').split(',').filter(Boolean);
  const filtering = params.get('filtering') ? JSON.parse(params.get('filtering')) : [];
  const campaignFilter = filtering.find((f) => f.field === 'campaign.id');
  const groups = new Map();
  for (let date = range.since; date <= range.until; date = shift(date, 1)) {
    for (const ad of ads) {
      if (campaignFilter && !campaignFilter.value.includes(ad.campaign.id)) continue;
      const m = dayMetrics(ad, date);
      if (!m) continue;
      for (const part of splits(breakdowns, ad)) {
        const levelKey = level === 'campaign' ? ad.campaign.id : level === 'adset' ? ad.adset.id : level === 'ad' ? ad.id : 'acc';
        const key = [levelKey, increment === '1' ? date : '', JSON.stringify(part.dims)].join('|');
        if (!groups.has(key)) {
          groups.set(key, { ad, dims: part.dims, date_start: increment === '1' ? date : range.since, date_stop: increment === '1' ? date : range.until, m: { spend: 0, impressions: 0, clicks: 0, inline_link_clicks: 0, actions: {} } });
        }
        add(groups.get(key).m, scale(m, part.f));
      }
    }
  }
  const fields = (params.get('fields') || '').split(',');
  return [...groups.values()].map((g) => {
    const row = { date_start: g.date_start, date_stop: g.date_stop, ...g.dims };
    const m = g.m;
    if (fields.includes('spend')) row.spend = m.spend.toFixed(2);
    if (fields.includes('impressions')) row.impressions = String(Math.round(m.impressions));
    if (fields.includes('clicks')) row.clicks = String(Math.round(m.clicks));
    if (fields.includes('inline_link_clicks')) row.inline_link_clicks = String(Math.round(m.inline_link_clicks));
    if (fields.includes('reach')) row.reach = String(Math.round(m.impressions / 1.32));
    if (fields.includes('frequency')) row.frequency = m.impressions ? '1.32' : '0';
    if (fields.includes('actions')) row.actions = Object.entries(m.actions).filter(([, v]) => Math.round(v) > 0).map(([k, v]) => ({ action_type: k, value: String(Math.round(v)) }));
    if (fields.includes('campaign_id')) row.campaign_id = g.ad.campaign.id;
    if (fields.includes('campaign_name')) row.campaign_name = g.ad.campaign.name;
    if (fields.includes('objective')) row.objective = g.ad.campaign.objective;
    if (fields.includes('adset_id')) row.adset_id = g.ad.adset.id;
    if (fields.includes('adset_name')) row.adset_name = g.ad.adset.name;
    if (fields.includes('ad_id')) row.ad_id = g.ad.id;
    if (fields.includes('ad_name')) row.ad_name = g.ad.name;
    return row;
  });
}

function paginate(res, url, rows) {
  const limit = Number(url.searchParams.get('limit') || 25);
  const offset = Number(url.searchParams.get('after') || 0);
  const page = rows.slice(offset, offset + limit);
  const body = { data: page, paging: { cursors: { before: String(offset), after: String(offset + limit) } } };
  if (offset + limit < rows.length) {
    const next = new URL(url.toString(), ORIGIN);
    next.searchParams.set('after', String(offset + limit));
    body.paging.next = `${ORIGIN}${next.pathname}${next.search}`;
  }
  send(res, 200, body);
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function thumb(color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><rect width="480" height="480" fill="${color}"/><text x="240" y="250" font-family="Georgia,serif" font-size="44" fill="#fff" text-anchor="middle" letter-spacing="6">THE EDIT</text><text x="240" y="300" font-family="sans-serif" font-size="18" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  const token = url.searchParams.get('access_token');
  if (!token) return send(res, 400, { error: { message: 'An access token is required', type: 'OAuthException', code: 104 } });
  if (token === 'expired') return send(res, 400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'MOCK' } });
  const path = url.pathname.replace(/^\/v\d+\.\d+/, '');
  const p = url.searchParams;

  if (path === `/act_${ACCOUNT}`) {
    return send(res, 200, { id: `act_${ACCOUNT}`, name: 'The Edit', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1, amount_spent: '1842311', balance: '40230', spend_cap: '0', business_name: 'The Edit ' });
  }
  if (path === `/act_${ACCOUNT}/campaigns`) {
    return paginate(res, url, campaigns.map((c) => ({ id: c.id, name: c.name, objective: c.objective, status: c.status, effective_status: c.status, daily_budget: c.daily_budget || undefined, budget_remaining: c.daily_budget || '0', start_time: `${c.start}T10:00:00-0300`, stop_time: c.end ? `${c.end}T23:59:00-0300` : undefined, created_time: `${c.start}T09:00:00-0300`, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' })));
  }
  if (path === `/act_${ACCOUNT}/adsets`) {
    return paginate(res, url, adsets.map(({ share, ...a }) => a));
  }
  if (path === `/act_${ACCOUNT}/insights`) return paginate(res, url, insights(p));
  if (path === '/' && p.get('ids')) {
    const ids = p.get('ids').split(',');
    const out = {};
    for (const id of ids) {
      const ad = ads.find((x) => x.id === id);
      if (ad) out[id] = { id, effective_status: ad.campaign.status === 'ACTIVE' ? 'ACTIVE' : 'CAMPAIGN_PAUSED', creative: { id: ad.creative_id } };
      const cr = ads.find((x) => x.creative_id === id);
      if (cr) out[id] = { id, thumbnail_url: thumb(cr.color, cr.name.split(' · ')[0]), object_type: 'VIDEO', instagram_permalink_url: 'https://www.instagram.com/p/EXEMPLO/' };
    }
    return send(res, 200, out);
  }
  return send(res, 404, { error: { message: `Unknown path ${path}`, code: 100 } });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Mock Graph API em ${ORIGIN}`));

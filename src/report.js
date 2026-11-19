// Monta os dados do dashboard a partir da Marketing API da Meta.

import { createMetaClient } from './meta.js';
import {
  addMetrics,
  emptyMetrics,
  extract,
  goalToKey,
  isAppObjective,
  num,
  objectiveToKey,
  resultValue,
  sumMetrics,
} from './metrics.js';

export class InputError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const MAX_RANGE_DAYS = 400;
const STRUCTURE_TTL = 600;

const BASE_FIELDS = ['spend', 'impressions', 'clicks', 'inline_link_clicks', 'actions', 'action_values', 'video_thruplay_watched_actions'];
const TOTAL_FIELDS = [...BASE_FIELDS, 'reach', 'frequency'];

const ACCOUNT_STATUS = {
  1: 'Ativa',
  2: 'Desativada',
  3: 'Pagamento pendente',
  7: 'Em análise de risco',
  8: 'Liquidação pendente',
  9: 'Período de carência',
  100: 'Encerramento pendente',
  101: 'Encerrada',
  201: 'Ativa',
  202: 'Encerrada',
};

// ---------- datas ----------

const isoToday = () => new Date().toISOString().slice(0, 10);

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function enumerateDays(since, until) {
  const out = [];
  for (let d = since; d <= until; d = shiftDate(d, 1)) out.push(d);
  return out;
}

export function parseRange(url) {
  const since = url.searchParams.get('since') || '';
  const until = url.searchParams.get('until') || '';
  if (!DATE_RE.test(since) || !DATE_RE.test(until) || Number.isNaN(Date.parse(since)) || Number.isNaN(Date.parse(until))) {
    throw new InputError('Período inválido. Use datas no formato AAAA-MM-DD.');
  }
  if (since > until) throw new InputError('A data inicial precisa ser anterior à final.');
  const length = diffDays(since, until) + 1;
  if (length > MAX_RANGE_DAYS) throw new InputError(`Escolha um período de até ${MAX_RANGE_DAYS} dias.`);
  const prevUntil = shiftDate(since, -1);
  const prevSince = shiftDate(prevUntil, -(length - 1));
  return { since, until, days: length, prevSince, prevUntil };
}

// Dados recentes mudam (atribuição atrasada); períodos fechados podem ficar mais tempo em cache.
function ttlFor(until) {
  return until >= shiftDate(isoToday(), -3) ? 600 : 6 * 3600;
}

// ---------- helpers ----------

function accountId(env) {
  const id = String(env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '').trim();
  if (!/^\d+$/.test(id)) throw new InputError('META_AD_ACCOUNT_ID não configurado corretamente no wrangler.toml.');
  return id;
}

const money = (minorUnits) => (minorUnits == null || minorUnits === '' ? null : num(minorUnits) / 100);
const round2 = (value) => Math.round(value * 100) / 100;

function compact(m) {
  if (!m) return null;
  const { actions, ...rest } = m;
  rest.spend = round2(rest.spend);
  rest.purchase_value = round2(rest.purchase_value);
  if (rest.frequency != null) rest.frequency = round2(rest.frequency);
  return rest;
}

function insights(meta, env, params, ttl) {
  return meta.all(
    `act_${accountId(env)}/insights`,
    { limit: 500, use_unified_attribution_setting: 'true', ...params },
    ttl,
    12,
  );
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Estrutura da conta (campanhas e conjuntos) para saber o "resultado" de cada campanha.
async function getStructure(meta, env) {
  const id = accountId(env);
  const [campaigns, adsets] = await Promise.all([
    meta.all(
      `act_${id}/campaigns`,
      {
        fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,bid_strategy',
        limit: 500,
      },
      STRUCTURE_TTL,
      6,
    ),
    meta.all(
      `act_${id}/adsets`,
      {
        fields: 'id,name,campaign_id,optimization_goal,destination_type,promoted_object,status,effective_status,daily_budget,lifetime_budget,start_time,end_time',
        limit: 500,
      },
      STRUCTURE_TTL,
      6,
    ),
  ]);

  const campaignObjective = new Map(campaigns.map((c) => [c.id, c.objective]));
  const adsetInfo = new Map();
  const adsetsByCampaign = new Map();
  const appStores = new Map();

  for (const a of adsets) {
    const key = goalToKey(a.optimization_goal, a.promoted_object, campaignObjective.get(a.campaign_id));
    const info = {
      id: a.id,
      name: a.name,
      campaign_id: a.campaign_id,
      optimization_goal: a.optimization_goal || null,
      destination_type: a.destination_type || null,
      status: a.status,
      effective_status: a.effective_status,
      daily_budget: money(a.daily_budget),
      lifetime_budget: money(a.lifetime_budget),
      result_key: key,
    };
    adsetInfo.set(a.id, info);
    if (!adsetsByCampaign.has(a.campaign_id)) adsetsByCampaign.set(a.campaign_id, []);
    adsetsByCampaign.get(a.campaign_id).push(info);

    const po = a.promoted_object || {};
    if (po.application_id || po.object_store_url) {
      const storeKey = `${po.application_id || ''}|${po.object_store_url || ''}`;
      if (!appStores.has(storeKey)) {
        appStores.set(storeKey, { application_id: po.application_id || null, object_store_url: po.object_store_url || null });
      }
    }
  }

  const campaignInfo = new Map();
  for (const c of campaigns) {
    const sets = adsetsByCampaign.get(c.id) || [];
    const active = sets.filter((s) => s.effective_status === 'ACTIVE');
    const resultKey = mostCommon((active.length ? active : sets).map((s) => s.result_key)) || objectiveToKey(c.objective);
    let dailyBudget = money(c.daily_budget);
    let lifetimeBudget = money(c.lifetime_budget);
    let budgetLevel = dailyBudget || lifetimeBudget ? 'campaign' : null;
    if (!budgetLevel) {
      const activeDaily = active.reduce((acc, s) => acc + (s.daily_budget || 0), 0);
      const activeLifetime = active.reduce((acc, s) => acc + (s.lifetime_budget || 0), 0);
      if (activeDaily || activeLifetime) {
        dailyBudget = activeDaily || null;
        lifetimeBudget = activeLifetime || null;
        budgetLevel = 'adset';
      }
    }
    campaignInfo.set(c.id, {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effective_status: c.effective_status,
      daily_budget: dailyBudget,
      lifetime_budget: lifetimeBudget,
      budget_remaining: money(c.budget_remaining),
      budget_level: budgetLevel,
      bid_strategy: c.bid_strategy || null,
      start_time: c.start_time || null,
      stop_time: c.stop_time || null,
      created_time: c.created_time || null,
      result_key: resultKey,
      is_app: resultKey === 'install' || isAppObjective(c.objective),
    });
  }

  return { campaignInfo, adsetInfo, appStores: [...appStores.values()] };
}

function campaignMeta(struct, id, objective) {
  const info = struct.campaignInfo.get(id);
  if (info) return info;
  const key = objectiveToKey(objective);
  return { id, objective, result_key: key, is_app: key === 'install' || isAppObjective(objective) };
}

function resultsByType(rows, struct) {
  const out = {};
  for (const row of rows) {
    const m = extract(row);
    if (!m.spend && !m.impressions) continue;
    const key = campaignMeta(struct, row.campaign_id, row.objective).result_key;
    out[key] ||= { value: 0, spend: 0, campaigns: 0 };
    out[key].value += resultValue(m, key);
    out[key].spend = round2(out[key].spend + m.spend);
    out[key].campaigns += 1;
  }
  return out;
}

function appActions(actions) {
  const out = {};
  for (const [type, value] of Object.entries(actions || {})) {
    if (type === 'mobile_app_install' || type.startsWith('app_custom_event.')) out[type] = value;
  }
  return out;
}

// ---------- relatório principal ----------

export async function buildReport(env, range, options = {}) {
  const meta = createMetaClient(env, options);
  const id = accountId(env);
  const ttl = ttlFor(range.until);
  const ttlPrev = ttlFor(range.prevUntil);
  const cur = { time_range: { since: range.since, until: range.until } };
  const prev = { time_range: { since: range.prevSince, until: range.prevUntil } };

  const [account, struct, accountCur, accountPrev, campaignCur, campaignPrev, campaignDaily, adsetCur] = await Promise.all([
    meta.get(`act_${id}`, { fields: 'name,currency,timezone_name,account_status,amount_spent,balance,spend_cap,business_name' }, 600),
    getStructure(meta, env),
    insights(meta, env, { ...cur, level: 'account', fields: TOTAL_FIELDS.join(',') }, ttl),
    insights(meta, env, { ...prev, level: 'account', fields: TOTAL_FIELDS.join(',') }, ttlPrev),
    insights(meta, env, { ...cur, level: 'campaign', fields: ['campaign_id', 'campaign_name', 'objective', ...TOTAL_FIELDS].join(',') }, ttl),
    insights(meta, env, { ...prev, level: 'campaign', fields: ['campaign_id', 'campaign_name', 'objective', ...BASE_FIELDS].join(',') }, ttlPrev),
    insights(meta, env, { ...cur, level: 'campaign', time_increment: 1, fields: ['campaign_id', 'objective', ...BASE_FIELDS].join(',') }, ttl),
    insights(meta, env, { ...cur, level: 'adset', fields: ['adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...TOTAL_FIELDS].join(',') }, ttl),
  ]);

  const totalsCur = accountCur[0] ? extract(accountCur[0]) : emptyMetrics();
  const totalsPrev = accountPrev[0] ? extract(accountPrev[0]) : emptyMetrics();

  // Série diária (somando campanhas) com resultado por tipo e recorte do app.
  const dayMap = new Map(enumerateDays(range.since, range.until).map((d) => [d, { m: emptyMetrics(), results: {}, app: emptyMetrics() }]));
  for (const row of campaignDaily) {
    const day = dayMap.get(row.date_start);
    if (!day) continue;
    const m = extract(row);
    const info = campaignMeta(struct, row.campaign_id, row.objective);
    addMetrics(day.m, m);
    day.results[info.result_key] = (day.results[info.result_key] || 0) + resultValue(m, info.result_key);
    if (info.is_app) addMetrics(day.app, m);
  }
  const daily = [...dayMap.entries()].map(([date, d]) => ({
    date,
    ...compact(d.m),
    results: d.results,
    app: { spend: round2(d.app.spend), impressions: d.app.impressions, link_clicks: d.app.link_clicks, install: d.app.install, registration: d.app.registration, app_registration: d.app.app_registration },
  }));

  // Campanhas
  const curById = new Map(campaignCur.map((r) => [r.campaign_id, r]));
  const prevById = new Map(campaignPrev.map((r) => [r.campaign_id, r]));
  const campaignIds = new Set([...struct.campaignInfo.keys(), ...curById.keys()]);
  const campaigns = [];
  for (const cid of campaignIds) {
    const curRow = curById.get(cid);
    const prevRow = prevById.get(cid);
    const info = campaignMeta(struct, cid, curRow && curRow.objective);
    const m = curRow ? extract(curRow) : null;
    const pm = prevRow ? extract(prevRow) : null;
    campaigns.push({
      ...info,
      name: info.name || (curRow && curRow.campaign_name) || cid,
      metrics: compact(m),
      result: m ? resultValue(m, info.result_key) : 0,
      prev: pm ? { spend: round2(pm.spend), result: resultValue(pm, info.result_key), impressions: pm.impressions, link_clicks: pm.link_clicks } : null,
    });
  }
  campaigns.sort((a, b) => (b.metrics ? b.metrics.spend : -1) - (a.metrics ? a.metrics.spend : -1) || String(b.created_time).localeCompare(String(a.created_time)));

  // Conjuntos de anúncios (com veiculação no período ou ativos)
  const adsetCurById = new Map(adsetCur.map((r) => [r.adset_id, r]));
  const adsetIds = new Set(adsetCur.map((r) => r.adset_id));
  for (const [aid, info] of struct.adsetInfo) if (info.effective_status === 'ACTIVE') adsetIds.add(aid);
  const adsets = [...adsetIds].map((aid) => {
    const row = adsetCurById.get(aid);
    const info = struct.adsetInfo.get(aid) || {
      id: aid,
      name: row && row.adset_name,
      campaign_id: row && row.campaign_id,
      result_key: campaignMeta(struct, row && row.campaign_id).result_key,
    };
    const m = row ? extract(row) : null;
    return { ...info, name: info.name || (row && row.adset_name) || aid, metrics: compact(m), result: m ? resultValue(m, info.result_key) : 0 };
  });

  // App
  const appRowsCur = campaignCur.filter((r) => campaignMeta(struct, r.campaign_id, r.objective).is_app);
  const appRowsPrev = campaignPrev.filter((r) => campaignMeta(struct, r.campaign_id, r.objective).is_app);
  const appCur = sumMetrics(appRowsCur.map(extract));
  const appPrev = sumMetrics(appRowsPrev.map(extract));

  const statusCode = num(account.account_status);
  return {
    generated_at: new Date().toISOString(),
    brand: env.BRAND_NAME || 'The Edit',
    range,
    account: {
      id,
      name: account.name,
      business_name: account.business_name || null,
      currency: account.currency || 'BRL',
      timezone: account.timezone_name || null,
      status_code: statusCode,
      status_label: ACCOUNT_STATUS[statusCode] || `Status ${statusCode}`,
      amount_spent: money(account.amount_spent),
      balance: money(account.balance),
      spend_cap: account.spend_cap && account.spend_cap !== '0' ? money(account.spend_cap) : null,
    },
    totals: {
      current: { ...compact(totalsCur), actions: totalsCur.actions },
      previous: { ...compact(totalsPrev), actions: totalsPrev.actions },
    },
    results: { current: resultsByType(campaignCur, struct), previous: resultsByType(campaignPrev, struct) },
    daily,
    campaigns,
    adsets,
    app: {
      stores: struct.appStores,
      campaign_ids: campaigns.filter((c) => c.is_app).map((c) => c.id),
      current: compact(appCur),
      previous: compact(appPrev),
      events: { current: appActions(appCur.actions), previous: appActions(appPrev.actions) },
      account_installs: totalsCur.install,
    },
  };
}

// ---------- anúncios / criativos ----------

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function buildAds(env, range, options = {}) {
  const meta = createMetaClient(env, options);
  const ttl = ttlFor(range.until);
  const cur = { time_range: { since: range.since, until: range.until } };

  const [struct, rows] = await Promise.all([
    getStructure(meta, env),
    insights(
      meta,
      env,
      { ...cur, level: 'ad', fields: ['ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', ...TOTAL_FIELDS].join(',') },
      ttl,
    ),
  ]);

  const top = rows
    .map((row) => ({ row, m: extract(row) }))
    .filter(({ m }) => m.impressions > 0 || m.spend > 0)
    .sort((a, b) => b.m.spend - a.m.spend)
    .slice(0, 120);

  const warnings = [];
  const adDetails = {};
  const creatives = {};
  try {
    const adChunks = await Promise.all(
      chunk(top.map(({ row }) => row.ad_id), 50).map((ids) => meta.get('', { ids: ids.join(','), fields: 'effective_status,creative{id}' }, STRUCTURE_TTL)),
    );
    for (const part of adChunks) Object.assign(adDetails, part);
    const creativeIds = [...new Set(Object.values(adDetails).map((ad) => ad && ad.creative && ad.creative.id).filter(Boolean))];
    const creativeChunks = await Promise.all(
      chunk(creativeIds, 50).map((ids) =>
        meta.get(
          '',
          {
            ids: ids.join(','),
            fields: 'thumbnail_url,image_url,object_type,title,body,instagram_permalink_url,effective_object_story_id,video_id',
            thumbnail_width: 480,
            thumbnail_height: 480,
          },
          3600,
        ),
      ),
    );
    for (const part of creativeChunks) Object.assign(creatives, part);
  } catch (err) {
    warnings.push('Não foi possível carregar as miniaturas dos criativos.');
  }

  const ads = top.map(({ row, m }) => {
    const detail = adDetails[row.ad_id] || {};
    const creative = (detail.creative && creatives[detail.creative.id]) || {};
    const adsetInfo = struct.adsetInfo.get(row.adset_id);
    const key = (adsetInfo && adsetInfo.result_key) || campaignMeta(struct, row.campaign_id).result_key;
    const campaign = struct.campaignInfo.get(row.campaign_id);
    return {
      id: row.ad_id,
      name: row.ad_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      effective_status: detail.effective_status || null,
      is_app: Boolean(campaign && campaign.is_app),
      result_key: key,
      result: resultValue(m, key),
      metrics: compact(m),
      creative: {
        thumbnail: creative.thumbnail_url || creative.image_url || null,
        type: creative.object_type || null,
        title: creative.title || null,
        body: creative.body || null,
        permalink:
          creative.instagram_permalink_url ||
          (creative.effective_object_story_id ? `https://www.facebook.com/${creative.effective_object_story_id}` : null),
      },
    };
  });

  return { generated_at: new Date().toISOString(), range, ads, total_ads: rows.length, warnings };
}

// ---------- quebras (público, posicionamento, região, dispositivo) ----------

const DIMENSIONS = {
  age_gender: 'age,gender',
  platform: 'publisher_platform,platform_position',
  region: 'region',
  device: 'impression_device',
};

export async function buildBreakdown(env, range, dim, scope, options = {}) {
  if (!DIMENSIONS[dim]) throw new InputError('Quebra inválida.');
  const meta = createMetaClient(env, options);
  const ttl = ttlFor(range.until);
  const struct = await getStructure(meta, env);

  let ids = null;
  let resultKey = null;
  if (scope === 'app') {
    ids = [...struct.campaignInfo.values()].filter((c) => c.is_app).map((c) => c.id);
    resultKey = 'install';
  } else if (/^\d+$/.test(scope || '')) {
    ids = [scope];
    resultKey = campaignMeta(struct, scope).result_key;
  } else if (scope && scope !== 'all') {
    throw new InputError('Escopo inválido.');
  }
  if (ids && ids.length === 0) return { dim, scope, result_key: resultKey, rows: [] };

  const rows = await insights(
    meta,
    env,
    {
      time_range: { since: range.since, until: range.until },
      level: 'account',
      breakdowns: DIMENSIONS[dim],
      fields: 'spend,impressions,reach,clicks,inline_link_clicks,actions,action_values',
      filtering: ids ? [{ field: 'campaign.id', operator: 'IN', value: ids }] : undefined,
    },
    ttl,
  );

  return {
    dim,
    scope: scope || 'all',
    result_key: resultKey,
    rows: rows.map((row) => {
      const m = extract(row);
      return {
        age: row.age,
        gender: row.gender,
        publisher_platform: row.publisher_platform,
        platform_position: row.platform_position,
        region: row.region,
        impression_device: row.impression_device,
        ...compact(m),
        result: resultKey ? resultValue(m, resultKey) : null,
      };
    }),
  };
}

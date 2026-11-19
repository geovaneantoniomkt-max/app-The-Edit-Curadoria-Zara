/* Dashboard The Edit — lógica de apresentação (sem dependências externas).
   Mesma base dos dashboards da Steink (Lapidation, Zenbee...): uma marca por conta de anúncio,
   orgânico do Instagram/Facebook e, aqui, a seção App (instalações e eventos do SDK da Meta).
   A The Edit não capta contato nem vende no site: o painel se organiza por "frentes"
   (tráfego para a landing page, visitas ao perfil, instalações do app) — layout "frentes" no config.
   O menu é montado a partir de config.json; trocar de marca re-aponta state.meta/organic/idx.
   Lê /config.json, /data/meta.json e /data/organic.json (protegidos por senha no servidor). */
"use strict";

/* ===================================================================== utils */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "href" || k === "src") { if (/^https?:\/\//i.test(String(v))) el.setAttribute(k, v); }
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "hidden") el.hidden = !!v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function svg(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
}

const nfBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfDec = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfDec1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ok = (n) => n != null && Number.isFinite(n);
const fmt = {
  brl: (n) => (ok(n) ? nfBRL.format(n) : "—"),
  int: (n) => (ok(n) ? nfInt.format(n) : "—"),
  dec: (n) => (ok(n) ? nfDec.format(n) : "—"),
  dec1: (n) => (ok(n) ? nfDec1.format(n) : "—"),
  pct: (n) => (ok(n) ? nfDec.format(n) + "%" : "—"),
  conv: (n) => (!ok(n) ? "—" : Number.isInteger(Math.round(n * 100) / 100) ? nfInt.format(Math.round(n)) : nfDec1.format(n)),
  compact: (n) => (!ok(n) ? "—" : Math.abs(n) >= 1e6 ? nfDec1.format(n / 1e6) + " mi" : Math.abs(n) >= 1e4 ? nfDec1.format(n / 1e3) + " mil" : nfInt.format(n)),
  date: (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—"),
  dm: (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : ""),
  dateTime: (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  },
};
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function isoToDate(s) { return new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); }
function dateToIso(d) { return d.toISOString().slice(0, 10); }
function addDays(iso, n) { const d = isoToDate(iso); d.setUTCDate(d.getUTCDate() + n); return dateToIso(d); }
function daysBetween(a, b) { return Math.round((isoToDate(b) - isoToDate(a)) / 86400000) + 1; }
function monthStart(iso) { return iso.slice(0, 8) + "01"; }
function monthEnd(iso) { const d = isoToDate(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return dateToIso(d); }
function daysInMonth(iso) { return +monthEnd(iso).slice(8, 10); }
function sum(arr, f) { let s = 0; for (const x of arr) s += f ? (f(x) || 0) : (x || 0); return s; }
const div = (a, b) => (b > 0 ? a / b : null);

function deltaBadge(cur, prev, { goodWhenUp = true, kind = "num" } = {}) {
  if (!ok(cur) || !ok(prev) || prev === 0) return h("span", { class: "delta", text: "—" });
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return h("span", { class: "delta", text: "= igual" });
  const up = pct > 0;
  const good = goodWhenUp ? up : !up;
  const arrow = up ? "↑" : "↓";
  return h("span", { class: `delta ${good ? "up" : "down"}`, title: `Período anterior: ${kind === "brl" ? fmt.brl(prev) : kind === "pct" ? fmt.pct(prev) : fmt.int(prev)}` }, `${arrow} ${nfDec1.format(Math.abs(pct))}%`);
}
function badge(level, text) {
  const cls = level === "ok" ? "ok" : level === "warn" ? "warn" : level === "crit" ? "crit" : "neutral";
  const ico = level === "ok" ? "●" : level === "warn" ? "▲" : level === "crit" ? "■" : "○";
  return h("span", { class: `badge ${cls}` }, `${ico} ${text}`);
}
function statusBadge(effective, configured) {
  const s = effective || configured || "";
  if (s === "ACTIVE") return h("span", { class: "badge status-active", text: "ativo" });
  if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "AD_PAUSED"].includes(s)) return h("span", { class: "badge status-paused", text: "pausado" });
  if (s === "ARCHIVED") return h("span", { class: "badge status-paused", text: "arquivado" });
  if (["WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW", "PENDING_BILLING_INFO", "IN_PROCESS"].includes(s)) return h("span", { class: "badge status-issue", text: s === "PENDING_REVIEW" ? "em análise" : s === "IN_PROCESS" ? "processando" : s === "DISAPPROVED" ? "reprovado" : "com problema" });
  return h("span", { class: "badge status-paused", text: s.toLowerCase() || "—" });
}

/* ============================================================ domínio Meta */
const OBJECTIVE_LABEL = {
  OUTCOME_LEADS: "Cadastros / conversas", OUTCOME_SALES: "Vendas", OUTCOME_TRAFFIC: "Tráfego", OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_APP_PROMOTION: "App", MESSAGES: "Mensagens", LEAD_GENERATION: "Cadastros",
  CONVERSIONS: "Conversões", LINK_CLICKS: "Tráfego", REACH: "Alcance", BRAND_AWARENESS: "Reconhecimento", POST_ENGAGEMENT: "Engajamento",
  VIDEO_VIEWS: "Vídeo", PAGE_LIKES: "Curtidas",
};
/* Loja (Nuvemshop, desde a Black de nov/2026). O pixel manda o funil inteiro e a API
   devolve cada evento com até três nomes (omni_*, o curto e offsite_conversion.*) que
   são o mesmo número. Por isso primeiraChave, nunca a soma. */
const PURCHASE_KEYS = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const LPV_KEYS = ["landing_page_view", "omni_landing_page_view"];
const VIEW_KEYS = ["omni_view_content", "view_content", "offsite_conversion.fb_pixel_view_content"];
const CART_KEYS = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT_KEYS = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const PAYMENT_KEYS = ["omni_add_payment_info", "add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"];
/* App (The Edit): instalação e cadastro chegam pelo SDK da Meta. Mesma regra: primeira chave, nunca a soma. */
const INSTALL_KEYS = ["mobile_app_install", "omni_app_install", "app_install"];
const APP_REG_KEYS = ["app_custom_event.fb_mobile_complete_registration", "omni_complete_registration", "complete_registration"];
const GOAL_RESULT = {
  CONVERSATIONS: { label: "Conversas iniciadas", unit: "conversa", keys: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"], target: "cost_per_conversation", kind: "lead" },
  LEAD_GENERATION: { label: "Cadastros", unit: "cadastro", keys: ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"], target: "cost_per_lead", kind: "lead" },
  QUALITY_LEAD: { label: "Cadastros", unit: "cadastro", keys: ["lead", "onsite_conversion.lead_grouped"], target: "cost_per_lead", kind: "lead" },
  QUALITY_CALL: { label: "Ligações", unit: "ligação", keys: ["onsite_conversion.click_to_call", "call_confirm_grouped"], target: "cost_per_conversation", kind: "lead" },
  OFFSITE_CONVERSIONS: { label: "Conversões", unit: "conversão", keys: ["purchase", "offsite_conversion.fb_pixel_purchase", "lead", "offsite_conversion.fb_pixel_lead", "contact_website", "onsite_conversion.messaging_conversation_started_7d", "offsite_conversion.fb_pixel_custom"], target: "cost_per_lead", kind: "lead" },
  // campanha de venda: conjunto otimizando o evento Purchase (promoted_event) ou objetivo Vendas
  PURCHASE: { label: "Compras", unit: "compra", keys: PURCHASE_KEYS, target: "cost_per_purchase", kind: "sale", noProxy: true },
  CONTACT: { label: "Contatos", unit: "contato", keys: ["contact_website", "contact_total", "offsite_conversion.fb_pixel_contact"], target: "cost_per_contact", kind: "lead" },
  VALUE: { label: "Conversões", unit: "conversão", keys: ["purchase", "offsite_conversion.fb_pixel_purchase", "lead"], target: "cost_per_conversation", kind: "lead" },
  LINK_CLICKS: { label: "Cliques no link", unit: "clique", keys: ["link_click"], kind: "traffic" },
  LANDING_PAGE_VIEWS: { label: "Visualizações da página", unit: "visualização", keys: ["landing_page_view", "omni_landing_page_view", "link_click"], target: "cost_per_lpv", kind: "traffic" },
  APP_INSTALLS: { label: "Instalações do app", unit: "instalação", keys: INSTALL_KEYS, target: "cost_per_install", kind: "app", noProxy: true },
  APP_INSTALLS_AND_OFFSITE_CONVERSIONS: { label: "Instalações do app", unit: "instalação", keys: INSTALL_KEYS, target: "cost_per_install", kind: "app", noProxy: true },
  PROFILE_VISIT: { label: "Visitas ao perfil", unit: "visita", keys: ["profile_visit", "link_click"], target: "cost_per_profile_visit", kind: "traffic" },
  VISIT_INSTAGRAM_PROFILE: { label: "Visitas ao perfil", unit: "visita", keys: ["profile_visit", "link_click"], target: "cost_per_profile_visit", kind: "traffic" },
  REACH: { label: "Alcance", unit: "pessoa", metric: "reach", kind: "awareness", per: 1000 },
  AD_RECALL_LIFT: { label: "Alcance", unit: "pessoa", metric: "reach", kind: "awareness", per: 1000 },
  IMPRESSIONS: { label: "Impressões", unit: "impressão", metric: "impressions", kind: "awareness", per: 1000 },
  THRUPLAY: { label: "ThruPlays", unit: "thruplay", metric: "thruplays", kind: "awareness" },
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: { label: "Visualizações de vídeo", unit: "visualização", keys: ["video_view"], kind: "awareness" },
  POST_ENGAGEMENT: { label: "Engajamentos", unit: "engajamento", keys: ["post_engagement"], kind: "awareness" },
  PAGE_LIKES: { label: "Curtidas na página", unit: "curtida", keys: ["like"], kind: "awareness" },
};
const DEFAULT_RESULT = { label: "Cliques no link", unit: "clique", keys: ["link_click"], kind: "traffic" };
/* As três formas de captação que já passaram pela conta. A de WhatsApp é
   histórica (campanha desativada em outubro) mas continua aqui: sem ela,
   setembro apareceria zerado no painel. */
const CONV_KEY = "onsite_conversion.messaging_conversation_started_7d";
// "Leads no site": evento Lead do pixel
const LEAD_KEYS = ["offsite_conversion.fb_pixel_lead", "lead",
                   "onsite_conversion.lead_grouped", "leadgen_grouped"];
// "Contatos": vem do campo `conversions` da API, não de `actions`
const CONTACT_KEYS = ["contact_website", "contact_total",
                      "offsite_conversion.fb_pixel_contact", "contact"];
// primeira chave presente, nunca a soma: contact_website e contact_total são
// o mesmo número com nomes diferentes, somar dobraria a contagem
function primeiraChave(actions, keys) {
  for (const k of keys) if (actions[k]) return actions[k];
  return 0;
}

/* ================================================================ estado */
const state = {
  config: null,
  brands: [],          // [{ id, name, accent, meta, organic, idx, targets, budget }]
  brandId: null,       // marca ativa
  brand: null,
  meta: null, organic: null, google: null, clarity: null, clarityProject: null,
  range: { since: null, until: null },   // união das janelas das marcas
  since: null, until: null, preset: "max", prevSince: null, prevUntil: null,
  targets: {}, section: "exec", scope: "geral",
  creativeFilter: { campaign: "all", quality: "all" },
};
// aponta para o índice da marca ativa — trocado por activateBrand()
let idx = { campaigns: new Map(), adsets: new Map(), ads: new Map(), resultDefByCampaign: new Map(), kindByCampaign: new Map(), campaignByAd: new Map() };
const brandById = (id) => state.brands.find((b) => b.id === id) || null;

const targetsKey = (brandId) => `theedit.targets.${brandId}`;
function loadTargets(brand) {
  // a verba é da marca; as metas de custo vêm do config e podem ser sobrescritas por marca
  const base = { ...state.config.targets, ...(brand.targets || {}), meta_monthly: brand.budget?.meta_monthly ?? null };
  try {
    const saved = JSON.parse(localStorage.getItem(targetsKey(brand.id)) || "null");
    if (saved && typeof saved === "object") return { ...base, ...saved };
  } catch { /* ignore */ }
  return base;
}
function saveTargets(brandId, t) { try { localStorage.setItem(targetsKey(brandId), JSON.stringify(t)); } catch { /* ignore */ } }

/* ============================================================== agregação */
function emptyAgg() { return { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, thruplays: 0, actions: {}, values: {}, days: new Set() }; }
function addRow(agg, r) {
  agg.spend += r.spend || 0; agg.impressions += r.impressions || 0; agg.reach += r.reach || 0;
  agg.clicks += r.clicks || 0; agg.link_clicks += r.link_clicks || 0; agg.thruplays += r.thruplays || 0;
  if (r.date) agg.days.add(r.date);
  for (const [k, v] of Object.entries(r.actions || {})) agg.actions[k] = (agg.actions[k] || 0) + v;
  // valor em R$ por evento (action_values) — só existe nas coletas a partir de nov/2026
  for (const [k, v] of Object.entries(r.values || {})) agg.values[k] = (agg.values[k] || 0) + v;
  return agg;
}
function finish(agg) {
  agg.cpm = div(agg.spend * 1000, agg.impressions);
  agg.ctr = div(agg.clicks * 100, agg.impressions);
  agg.cpc = div(agg.spend, agg.clicks);
  agg.link_ctr = div(agg.link_clicks * 100, agg.impressions);
  agg.frequency = div(agg.impressions, agg.reach);
  agg.conversations = agg.actions[CONV_KEY] || 0;
  agg.leads = primeiraChave(agg.actions, LEAD_KEYS);
  agg.contacts = primeiraChave(agg.actions, CONTACT_KEYS);
  // captação total: as três são pedidos de contato, só que por caminhos diferentes
  agg.captures = agg.conversations + agg.leads + agg.contacts;
  agg.cost_per_conversation = div(agg.spend, agg.conversations);
  agg.cost_per_lead = div(agg.spend, agg.leads);
  agg.cost_per_contact = div(agg.spend, agg.contacts);
  agg.cost_per_capture = div(agg.spend, agg.captures);
  // loja: o funil do pixel, do clique à compra
  agg.link_cpc = div(agg.spend, agg.link_clicks);
  agg.lpv = primeiraChave(agg.actions, LPV_KEYS);
  agg.views = primeiraChave(agg.actions, VIEW_KEYS);
  agg.carts = primeiraChave(agg.actions, CART_KEYS);
  agg.checkouts = primeiraChave(agg.actions, CHECKOUT_KEYS);
  agg.payments = primeiraChave(agg.actions, PAYMENT_KEYS);
  agg.purchases = primeiraChave(agg.actions, PURCHASE_KEYS);
  agg.revenue = primeiraChave(agg.values, PURCHASE_KEYS);
  agg.roas = div(agg.revenue, agg.spend);
  agg.aov = div(agg.revenue, agg.purchases);
  agg.cost_per_purchase = div(agg.spend, agg.purchases);
  agg.cost_per_cart = div(agg.spend, agg.carts);
  agg.cost_per_checkout = div(agg.spend, agg.checkouts);
  // app: instalação e cadastro (SDK da Meta)
  agg.installs = primeiraChave(agg.actions, INSTALL_KEYS);
  agg.app_registrations = primeiraChave(agg.actions, APP_REG_KEYS);
  agg.cost_per_install = div(agg.spend, agg.installs);
  agg.cost_per_app_registration = div(agg.spend, agg.app_registrations);
  return agg;
}
function aggregate(rows) { const a = emptyAgg(); for (const r of rows) addRow(a, r); return finish(a); }
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, emptyAgg()); addRow(m.get(k), r); }
  for (const v of m.values()) finish(v);
  return m;
}
function rowsIn(since, until, rows = state.meta.daily) { return rows.filter((r) => r.date >= since && r.date <= until); }

// meta explícito porque buildIndexes roda no carregamento, antes de haver marca ativa
function resolveResultDef(def, meta = state.meta) {
  if (def.metric) return { ...def, key: null };
  const seen = new Set(meta?.action_types_seen || []);
  const key = def.keys.find((k) => seen.has(k)) || def.keys[0];
  if (def.noProxy) return { ...def, key, proxy: null };
  return { ...def, key, proxy: key !== def.keys[0] && def.keys[0] === "profile_visit" ? "cliques no link como proxy" : key !== def.keys[0] ? `usando ${key}` : null };
}
function resultDefFor(campaignId) { return idx.resultDefByCampaign.get(campaignId) || resolveResultDef(DEFAULT_RESULT); }
function resultsOf(agg, def) {
  if (!def) return 0;
  if (def.metric) return agg[def.metric] || 0;
  return agg.actions[def.key] || 0;
}
function costPerResult(agg, def) {
  const r = resultsOf(agg, def);
  if (def.per) return div(agg.spend * def.per, r);
  return div(agg.spend, r);
}
function targetFor(def) {
  if (!def) return null;
  if (def.target) return state.targets[def.target] || null;
  if (def.kind === "awareness" && def.per) return state.targets.cpm_topo_max || null;
  return null;
}
function assess(agg, def, { minSpend } = {}) {
  /* devolve {level, text, ratio} — regra única usada em tabelas, cards e alertas */
  const min = minSpend ?? state.targets.min_spend_for_alert ?? 30;
  const results = resultsOf(agg, def);
  const cpr = costPerResult(agg, def);
  const target = targetFor(def);
  if (agg.spend <= 0) return { level: "neutral", text: "Sem gasto no período" };
  if (results === 0) {
    if (agg.spend >= min) return { level: "crit", text: `${fmt.brl(agg.spend)} sem nenhum resultado — pausar ou revisar`, ratio: null };
    return { level: "warn", text: "Sem resultado, mas gasto baixo — observar", ratio: null };
  }
  // venda sem meta de custo por compra: o critério passa a ser o ROAS mínimo, se houver
  const roasMin = state.targets.roas_min;
  if (def.kind === "sale" && !target && ok(roasMin) && roasMin > 0) {
    const roas = agg.roas || 0;
    const ratio = roasMin / Math.max(roas, 0.01);
    if (ratio <= 1) return { level: "ok", text: `ROAS ${fmt.dec(roas)} — dentro do mínimo, manter`, ratio };
    if (ratio <= 1.6) return { level: "warn", text: `ROAS ${fmt.dec(roas)}, abaixo do mínimo de ${fmt.dec(roasMin)} — otimizar`, ratio };
    return { level: "crit", text: `ROAS ${fmt.dec(roas)}, muito abaixo do mínimo de ${fmt.dec(roasMin)} — reduzir verba e revisar`, ratio };
  }
  if (!target || !ok(cpr)) return { level: "neutral", text: "Sem meta definida para este objetivo" };
  const ratio = cpr / target;
  if (ratio <= 1) return { level: "ok", text: "Dentro da meta — manter", ratio };
  if (ratio <= 1.6) return { level: "warn", text: `Custo ${nfDec1.format(ratio)}× a meta — otimizar segmentação/criativo`, ratio };
  return { level: "crit", text: `Custo ${nfDec1.format(ratio)}× a meta — reduzir verba e revisar`, ratio };
}

/* ================================================================ índices */
function buildIndexes(m) {
  const idx = { campaigns: new Map(), adsets: new Map(), ads: new Map(), resultDefByCampaign: new Map(), kindByCampaign: new Map(), campaignByAd: new Map() };
  idx.campaigns = new Map(m.campaigns.map((c) => [c.id, c]));
  idx.adsets = new Map(m.adsets.map((s) => [s.id, s]));
  idx.ads = new Map(m.ads.map((a) => [a.id, a]));
  for (const a of m.ads) idx.campaignByAd.set(a.id, a.campaign_id);
  const LEAD_GOALS = new Set(["CONVERSATIONS", "LEAD_GENERATION", "QUALITY_LEAD", "QUALITY_CALL", "OFFSITE_CONVERSIONS", "VALUE"]);
  const LEAD_OBJ = new Set(["OUTCOME_LEADS", "OUTCOME_SALES", "MESSAGES", "LEAD_GENERATION", "CONVERSIONS"]);
  for (const c of m.campaigns) {
    const sets = m.adsets.filter((s) => s.campaign_id === c.id);
    const goals = sets.map((s) => s.optimization_goal).filter(Boolean);
    const goal = goals[0];
    // Venda e captação usam o mesmo optimization_goal (OFFSITE_CONVERSIONS); o que separa
    // é o evento otimizado. Coletas antigas não têm promoted_event: aí vale o objetivo.
    const eventos = sets.map((s) => s.promoted_event).filter(Boolean);
    const vende = eventos.length ? eventos.includes("PURCHASE") : c.objective === "OUTCOME_SALES";
    let def = vende ? GOAL_RESULT.PURCHASE : GOAL_RESULT[goal];
    if (!def) {
      if (c.objective === "OUTCOME_APP_PROMOTION" || c.objective === "APP_INSTALLS" || c.objective === "MOBILE_APP_INSTALLS") def = GOAL_RESULT.APP_INSTALLS;
      else if (LEAD_OBJ.has(c.objective)) def = GOAL_RESULT.CONVERSATIONS;
      else if (c.objective === "OUTCOME_AWARENESS" || c.objective === "REACH") def = GOAL_RESULT.REACH;
      else if (c.objective === "OUTCOME_ENGAGEMENT") def = GOAL_RESULT.POST_ENGAGEMENT;
      else def = DEFAULT_RESULT;
    }
    idx.resultDefByCampaign.set(c.id, resolveResultDef(def, m));
    idx.kindByCampaign.set(c.id, goals.some((g) => LEAD_GOALS.has(g)) || LEAD_OBJ.has(c.objective) ? "captacao" : "topo");
  }
  return idx;
}
const capIn = (bIdx, campaignId) => bIdx.kindByCampaign.get(campaignId) === "captacao";
const isCaptacao = (campaignId) => idx.kindByCampaign.get(campaignId) === "captacao";
const vendaIn = (bIdx, campaignId) => bIdx?.resultDefByCampaign.get(campaignId)?.kind === "sale";
const isVenda = (campaignId) => vendaIn(idx, campaignId);
// conversão = captação (contato, lead, conversa) ou venda
const isConv = (def) => def?.kind === "lead" || def?.kind === "sale";
const temVendaNa = (meta, bIdx) => !!meta && meta.campaigns.some((c) => vendaIn(bIdx, c.id));
const appIn = (bIdx, campaignId) => bIdx?.resultDefByCampaign.get(campaignId)?.kind === "app";
const isApp = (campaignId) => appIn(idx, campaignId);
const temAppNa = (meta, bIdx) => !!meta && meta.campaigns.some((c) => appIn(bIdx, c.id));
const modoFrentes = (b = state.brand) => b?.layout === "frentes";

/* Frentes: campanhas agrupadas pelo resultado que otimizam (visitas na LP, visitas ao perfil,
   instalações...). Organiza o painel das contas que não captam contato nem vendem. */
function frentes(rows, bIdx = idx) {
  const map = new Map();
  for (const r of rows) {
    const def = bIdx?.resultDefByCampaign.get(r.campaign_id) || resolveResultDef(DEFAULT_RESULT);
    if (!map.has(def.label)) map.set(def.label, { def, rows: [] });
    map.get(def.label).rows.push(r);
  }
  return Array.from(map.values()).map((g) => ({ ...g, agg: aggregate(g.rows) }))
    .filter((g) => g.agg.spend > 0 || resultsOf(g.agg, g.def) > 0)
    .sort((a, b) => b.agg.spend - a.agg.spend);
}
const COR_FRENTE = { "Visualizações da página": "#3987e5", "Visitas ao perfil": "#d55181", "Instalações do app": "#199e70", "Cliques no link": "#c98500", "Engajamentos": "#9085e9", "Alcance": "#9085e9", "Conversas iniciadas": "#d95926" };
const corFrente = (def) => COR_FRENTE[def?.label] || "#898781";
const curtoFrente = (def) => ({ "Visualizações da página": "LP", "Visitas ao perfil": "Perfil IG", "Instalações do app": "App" })[def?.label] || def?.label || "—";
const nivelTxt = (lv) => (lv === "ok" ? "na meta" : lv === "warn" ? "atenção" : lv === "crit" ? "crítico" : "sem meta");

/* ================================================================ período */
function computePeriod() {
  // a janela é a união das marcas: trocar de marca não reseta o período escolhido
  const last = state.range.until || dateToIso(new Date());
  const first = state.range.since || addDays(last, -29);
  let since, until = last;
  switch (state.preset) {
    case "7": since = addDays(last, -6); break;
    case "14": since = addDays(last, -13); break;
    case "30": since = addDays(last, -29); break;
    case "month": since = monthStart(last); break;
    case "lastmonth": { const e = addDays(monthStart(last), -1); since = monthStart(e); until = e; break; }
    case "max": since = first; break;
    case "custom": since = state.since || first; until = state.until || last; break;
    default: since = first;
  }
  if (since < first && state.preset !== "custom") since = first;
  if (since > until) since = until;
  state.since = since; state.until = until;
  const len = daysBetween(since, until);
  state.prevUntil = addDays(since, -1);
  state.prevSince = addDays(since, -len);
}

/* ================================================================= charts */
let tooltipEl;
function showTooltip(x, y, title, rows) {
  tooltipEl.replaceChildren(h("div", { class: "tt-title", text: title }), ...rows.map((r) => h("div", { class: "tt-row" }, h("span", {}, r.color ? h("i", { style: undefined }) : null, r.label), h("b", { text: r.value }))));
  // cor dos marcadores via CSSOM (CSP proíbe style inline no HTML)
  $$(".tt-row i", tooltipEl).forEach((i, k) => { i.style.background = rows[k].color; });
  tooltipEl.hidden = false;
  const rect = tooltipEl.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 14;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 14;
  tooltipEl.style.left = left + "px"; tooltipEl.style.top = top + "px";
}
function hideTooltip() { tooltipEl.hidden = true; }

function niceTicks(max, count = 4, inteiro = false) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  // contagem (instalação, cadastro...) não tem meio: sem marcas de 0,5 no eixo
  if (inteiro && step < 1) step = 1;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
function roundedTop(x, y, w, hgt, r) {
  if (hgt <= 0) return "";
  r = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + hgt} Z`;
}

/** Gráfico de colunas (empilhadas ou não) ou linhas, com tooltip. */
function renderChart(container, { type = "bar", labels, series, stacked = true, format = fmt.int, target = null, targetLabel = "meta", height = 210 }) {
  container.replaceChildren();
  const W = Math.max(280, container.clientWidth || 600), H = height;
  const padL = 46, padR = 10, padT = 10, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const n = labels.length;
  const el = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img" });
  if (!n) { container.append(el); return; }
  let max = 0;
  for (let i = 0; i < n; i++) {
    if (type === "bar" && stacked) max = Math.max(max, sum(series, (s) => s.values[i] || 0));
    else for (const s of series) max = Math.max(max, s.values[i] || 0);
  }
  if (ok(target)) max = Math.max(max, target * 1.1);
  const ticks = niceTicks(max, 4, format === fmt.int);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => padT + ih - (v / top) * ih;
  for (const t of ticks) {
    el.append(svg("line", { x1: padL, x2: W - padR, y1: y(t), y2: y(t), class: "grid-line" }));
    const tx = svg("text", { x: padL - 6, y: y(t) + 3, "text-anchor": "end" }); tx.textContent = fmt.compact(t); el.append(tx);
  }
  const slot = iw / n;
  const every = Math.max(1, Math.ceil(n / Math.floor(iw / 42)));
  for (let i = 0; i < n; i++) {
    if (i % every !== 0 && i !== n - 1) continue;
    const tx = svg("text", { x: padL + slot * (i + 0.5), y: H - 6, "text-anchor": "middle" }); tx.textContent = labels[i]; el.append(tx);
  }
  if (type === "bar") {
    const bw = Math.min(24 * (stacked ? 1 : series.length), slot * 0.72);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      series.forEach((s, si) => {
        const v = s.values[i] || 0; if (v <= 0) return;
        const x0 = stacked ? padL + slot * (i + 0.5) - bw / 2 : padL + slot * (i + 0.5) - bw / 2 + (bw / series.length) * si;
        const w = stacked ? bw : bw / series.length - 1;
        // lado a lado (stacked: false) cada série parte do zero; só a pilha acumula
        const base = stacked ? acc : 0;
        const yTop = y(base + v), yBot = y(base);
        const gap = stacked && acc > 0 ? 2 : 0;
        const isTop = stacked ? si === series.length - 1 || series.slice(si + 1).every((t) => !(t.values[i] > 0)) : true;
        const hh = Math.max(0, yBot - yTop - gap);
        el.append(isTop ? svg("path", { d: roundedTop(x0, yTop, w, hh, 4), fill: s.color }) : svg("rect", { x: x0, y: yTop, width: w, height: hh, fill: s.color }));
        acc += v;
      });
    }
  } else {
    series.forEach((s) => {
      const pts = [];
      for (let i = 0; i < n; i++) { const v = s.values[i]; if (ok(v)) pts.push([padL + slot * (i + 0.5), y(v)]); else pts.push(null); }
      let d = "", pen = false;
      for (const p of pts) { if (!p) { pen = false; continue; } d += (pen ? "L" : "M") + p[0] + "," + p[1]; pen = true; }
      el.append(svg("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      pts.forEach((p) => { if (p) el.append(svg("circle", { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: "#18181a", "stroke-width": 2 })); });
    });
  }
  if (ok(target)) {
    el.append(svg("line", { x1: padL, x2: W - padR, y1: y(target), y2: y(target), class: "target-line" }));
    const tx = svg("text", { x: W - padR, y: y(target) - 4, "text-anchor": "end" }); tx.textContent = `${targetLabel} ${format(target)}`; el.append(tx);
  }
  // camada de hover
  for (let i = 0; i < n; i++) {
    const hit = svg("rect", { x: padL + slot * i, y: padT, width: slot, height: ih, class: "hit" });
    const show = (ev) => showTooltip(ev.clientX, ev.clientY, labels[i], series.map((s) => ({ label: s.name, value: format(s.values[i] || 0), color: s.color })));
    hit.addEventListener("mousemove", show); hit.addEventListener("mouseleave", hideTooltip);
    el.append(hit);
  }
  container.append(el);
}
function chartCard(title, subtitle, series, buildOpts) {
  const card = h("div", { class: "chart-card" });
  const head = h("div", { class: "chart-head" }, h("h3", {}, title, subtitle ? h("small", { text: subtitle }) : null));
  if (series.length >= 2) head.append(h("div", { class: "legend" }, ...series.map((s) => { const i = h("i"); i.style.background = s.color; return h("span", {}, i, s.name); })));
  const body = h("div", { class: "chart" });
  card.append(head, body);
  card._render = () => renderChart(body, { ...buildOpts, series });
  requestAnimationFrame(card._render);
  return card;
}

/* ============================================================ tiles/utils */
function tile({ label, value, sub, delta, accent, hero }) {
  return h("div", { class: `tile${accent ? " accent" : ""}` },
    h("div", { class: "label", text: label }),
    h("div", { class: `value${hero ? " hero" : ""}`, text: value }),
    (sub || delta) ? h("div", { class: "sub" }, delta || null, sub || null) : null,
  );
}
function block(title, subtitle, ...children) {
  return h("div", { class: "block" }, h("div", { class: "block-head" }, h("h2", {}, title, subtitle ? h("small", { text: subtitle }) : null)), ...children);
}
function progressBar(pct, level) {
  const p = h("div", { class: "progress" }); const i = h("i", { class: level || "" }); i.style.width = Math.max(0, Math.min(100, pct)) + "%"; p.append(i); return p;
}
function cprCell(agg, def) {
  const cpr = costPerResult(agg, def);
  const target = targetFor(def);
  const wrap = h("div", { class: "cpr" }, h("span", { text: ok(cpr) ? (def.per ? `${fmt.brl(cpr)}/mil` : fmt.brl(cpr)) : "—" }));
  if (ok(cpr) && target) {
    const ratio = cpr / target;
    const bar = h("div", { class: "bar" }); const i = h("i", { class: ratio <= 1 ? "" : ratio <= 1.6 ? "warn" : "crit" });
    i.style.width = Math.min(100, (1 / Math.max(ratio, 0.01)) * 60) + "%"; // 60% = na meta
    bar.append(i); wrap.append(bar);
  }
  return wrap;
}
function thumbOf(ad) { return ad?.creative?.image_url || ad?.creative?.thumbnail_url || null; }
function adLink(ad) { return ad?.creative?.instagram_permalink_url || ad?.preview_link || null; }

/* ===================================================== seção: executiva */
function renderExec() {
  const sec = $("#sec-exec"); sec.replaceChildren();
  const m = state.meta; const T = state.targets;
  const rows = rowsIn(state.since, state.until);
  const prevRows = rowsIn(state.prevSince, state.prevUntil);
  const all = aggregate(rows), prevAll = aggregate(prevRows);
  const cap = aggregate(rows.filter((r) => isCaptacao(r.campaign_id))), prevCap = aggregate(prevRows.filter((r) => isCaptacao(r.campaign_id)));
  const topo = aggregate(rows.filter((r) => !isCaptacao(r.campaign_id)));
  const temVenda = temVendaNa(m, idx);
  const venda = aggregate(rows.filter((r) => isVenda(r.campaign_id)));
  const temCaptacao = cap.contacts + cap.leads + cap.conversations > 0;
  const frentesMode = modoFrentes();
  const fr = frentesMode ? frentes(rows) : [];
  const frPrev = new Map(frentesMode ? frentes(prevRows).map((g) => [g.def.label, g]) : []);
  const frResult = fr.filter((g) => g.def.kind !== "awareness");
  const temApp = temAppNa(m, idx);
  const appAgg = aggregate(rows.filter((r) => isApp(r.campaign_id))), prevAppAgg = aggregate(prevRows.filter((r) => isApp(r.campaign_id)));
  const presetKey = { 7: "last_7d", 14: "last_14d", 30: "last_30d", month: "this_month", lastmonth: "last_month", max: "maximum" }[state.preset];
  const exact = presetKey && m.presets?.[presetKey];
  const reach = exact?.reach ?? all.reach;
  const reachNote = exact ? "alcance exato (API)" : "soma dos alcances diários";

  /* --- controle de investimento ------------------------------------------- */
  const last = state.range.until;
  const monthRows = rowsIn(monthStart(last), last);
  const monthAgg = aggregate(monthRows);
  const dayN = +last.slice(8, 10), dim = daysInMonth(last);
  const budget = T.meta_monthly || 0;
  const pace = monthAgg.spend / Math.max(1, dayN);
  const projection = pace * dim;
  const remainingDays = dim - dayN;
  const needPace = remainingDays > 0 ? Math.max(0, budget - monthAgg.spend) / remainingDays : 0;
  const usedPct = budget ? (monthAgg.spend / budget) * 100 : 0;
  const paceLevel = !budget ? "" : projection > budget * 1.15 ? "crit" : projection > budget * 1.05 ? "warn" : "good";
  const byKindMonth = { cap: sum(monthRows.filter((r) => isCaptacao(r.campaign_id)), (r) => r.spend), topo: sum(monthRows.filter((r) => !isCaptacao(r.campaign_id)), (r) => r.spend) };
  const dailyBudgetTotal = sum(m.campaigns.filter((c) => c.effective_status === "ACTIVE"), (c) => c.daily_budget || 0) + sum(m.adsets.filter((s) => s.effective_status === "ACTIVE" && !(idx.campaigns.get(s.campaign_id)?.daily_budget > 0)), (s) => s.daily_budget || 0);

  const splitFrentes = frentesMode ? h("div", { class: "split" }, ...frentes(monthRows).map((g) => h("div", { class: "split-row" },
    h("span", {}, spanDot(corFrente(g.def)), curtoFrente(g.def)), progressBar(budget ? (g.agg.spend / budget) * 100 : 0), h("b", { text: fmt.brl(g.agg.spend) })))) : null;
  const invest = h("div", { class: "grid c3" },
    h("div", { class: "tile accent" },
      h("div", { class: "label", text: `Verba do mês · ${MONTHS[+last.slice(5, 7) - 1]}` }),
      h("div", { class: "value hero", text: fmt.brl(monthAgg.spend) }),
      h("div", { class: "sub" }, budget ? `gastos de ${fmt.brl(budget)} · ${fmt.dec1(usedPct)}% usado` : "nenhuma verba mensal cadastrada para esta marca", badge(paceLevel === "good" ? "ok" : paceLevel === "warn" ? "warn" : paceLevel === "crit" ? "crit" : "neutral", paceLevel === "good" ? "no ritmo" : paceLevel === "warn" ? "ritmo alto" : paceLevel === "crit" ? "acima da verba" : "sem verba definida")),
      progressBar(usedPct, paceLevel),
      frentesMode ? splitFrentes : h("div", { class: "split" },
        h("div", { class: "split-row" }, h("span", {}, spanDot("var(--meta)"), temVenda ? "Venda/captação" : "Captação"), progressBar(budget ? (byKindMonth.cap / budget) * 100 : 0), h("b", { text: fmt.brl(byKindMonth.cap) })),
        h("div", { class: "split-row" }, h("span", {}, spanDot("var(--s7)"), "Topo de funil"), progressBar(budget ? (byKindMonth.topo / budget) * 100 : 0), h("b", { text: fmt.brl(byKindMonth.topo) })),
      ),
    ),
    h("div", { class: "tile" },
      h("div", { class: "label", text: "Ritmo de gasto" }),
      h("div", { class: "value" }, fmt.brl(pace), h("span", { class: "faint", text: "/dia" })),
      h("div", { class: "sub", text: `Ciclo ${fmt.date(monthStart(last))} a ${fmt.date(monthEnd(last))} · dia ${dayN} de ${dim}` }),
      h("div", { class: "sub" }, "Projeção do mês: ", h("b", { text: fmt.brl(projection) }), budget ? (projection > budget ? badge("warn", `${fmt.brl(projection - budget)} acima`) : badge("ok", `${fmt.brl(budget - projection)} sobram`)) : null),
      remainingDays > 0
        ? (budget ? h("div", { class: "sub" }, `Cabe ${fmt.brl(needPace)}/dia nos ${remainingDays} dias restantes`)
                  : h("div", { class: "sub", text: `${remainingDays} dias restantes no ciclo — sem verba para comparar` }))
        : h("div", { class: "sub", text: "Mês encerrado" }),
      h("div", { class: "sub faint", text: `Orçamento diário configurado nas campanhas ativas: ${fmt.brl(dailyBudgetTotal)}/dia (${fmt.brl(dailyBudgetTotal * 30)}/30d)` }),
    ),
    h("div", { class: "tile" },
      h("div", { class: "label", text: "Conta de anúncios" }),
      h("div", { class: "value", text: m.account.balance > 0 ? fmt.brl(m.account.balance) : fmt.brl(m.account.amount_spent_lifetime) }),
      h("div", { class: "sub", text: m.account.balance > 0 ? "saldo em conta (pré-pago)" : "investido desde o início da conta" }),
      h("div", { class: "sub" }, m.account.status === 1 ? badge("ok", "conta ativa") : badge("crit", `status ${m.account.status}`), m.account.spend_cap > 0 ? `limite de gasto ${fmt.brl(m.account.spend_cap)}` : null),
      h("div", { class: "sub faint", text: `${m.campaigns.filter((c) => c.effective_status === "ACTIVE").length} campanhas ativas de ${m.campaigns.length} · fuso ${m.account.timezone}` }),
    ),
  );

  /* --- o que está acontecendo -------------------------------------------- */
  // função, não elemento: o mesmo nó do DOM não pode estar nas duas linhas de KPI
  const tInvest = () => tile({ label: "Investimento no período", value: fmt.brl(all.spend), delta: deltaBadge(all.spend, prevAll.spend, { goodWhenUp: false, kind: "brl" }), sub: temVenda ? `Vendas ${fmt.brl(venda.spend)} · outras ${fmt.brl(all.spend - venda.spend)}` : `Captação ${fmt.brl(cap.spend)} · Topo ${fmt.brl(topo.spend)}`, accent: true });
  const nivelCpa = !ok(all.cost_per_purchase) || !ok(T.cost_per_purchase) ? null : all.cost_per_purchase <= T.cost_per_purchase ? "ok" : all.cost_per_purchase <= T.cost_per_purchase * 1.6 ? "warn" : "crit";
  const nivelRoas = !ok(all.roas) || !ok(T.roas_min) ? null : all.roas >= T.roas_min ? "ok" : all.roas >= T.roas_min / 1.6 ? "warn" : "crit";
  // na loja, a linha de cima é venda; ROAS e custo por compra usam o investimento total do período
  const kpisLoja = h("div", { class: "grid c6" },
    tInvest(),
    tile({ label: "Compras", value: fmt.int(all.purchases), delta: deltaBadge(all.purchases, prevAll.purchases), accent: true,
      sub: h("span", {}, ok(all.cost_per_purchase) ? `${fmt.brl(all.cost_per_purchase)} cada` : "nenhuma compra atribuída", ok(T.cost_per_purchase) ? ` · meta ${fmt.brl(T.cost_per_purchase)} ` : " ",
        nivelCpa ? badge(nivelCpa, nivelCpa === "ok" ? "na meta" : "atenção") : null) }),
    tile({ label: "Receita", value: fmt.brl(all.revenue), delta: deltaBadge(all.revenue, prevAll.revenue, { kind: "brl" }), accent: true,
      sub: ok(all.aov) ? `ticket médio ${fmt.brl(all.aov)}` : "valor das compras atribuídas ao Meta" }),
    tile({ label: "ROAS", value: ok(all.roas) && all.revenue > 0 ? fmt.dec(all.roas) : "—", delta: deltaBadge(all.roas, prevAll.roas),
      sub: h("span", {}, ok(T.roas_min) ? `mínimo ${fmt.dec(T.roas_min)} ` : "receita ÷ investimento · sem meta ", nivelRoas ? badge(nivelRoas, nivelRoas === "ok" ? "na meta" : "abaixo") : null) }),
    tile({ label: "Carrinhos · checkouts", value: `${fmt.int(all.carts)} · ${fmt.int(all.checkouts)}`, delta: deltaBadge(all.checkouts, prevAll.checkouts),
      sub: `${fmt.brl(all.cost_per_cart)} por carrinho · ${fmt.brl(all.cost_per_checkout)} por checkout` }),
    tile({ label: "Cliques no link", value: fmt.int(all.link_clicks), delta: deltaBadge(all.link_clicks, prevAll.link_clicks), sub: `CPC ${fmt.brl(all.link_cpc)} · CPM ${fmt.brl(all.cpm)} · ${fmt.int(all.impressions)} impr.` }),
  );
  const kpis = h("div", { class: "grid c6" },
    tInvest(),
    tile({ label: "Contatos", value: fmt.int(all.contacts), delta: deltaBadge(all.contacts, prevAll.contacts), accent: true,
      sub: h("span", {}, ok(cap.cost_per_contact) ? `${fmt.brl(cap.cost_per_contact)} cada · meta ${fmt.brl(T.cost_per_contact)} ` : "sem contatos no período ",
        ok(cap.cost_per_contact) && ok(T.cost_per_contact) ? badge(cap.cost_per_contact <= T.cost_per_contact ? "ok" : cap.cost_per_contact <= T.cost_per_contact * 1.6 ? "warn" : "crit", cap.cost_per_contact <= T.cost_per_contact ? "na meta" : "atenção") : null) }),
    tile({ label: "Leads no site", value: fmt.int(all.leads), delta: deltaBadge(all.leads, prevAll.leads), accent: true,
      sub: h("span", {}, ok(cap.cost_per_lead) ? `${fmt.brl(cap.cost_per_lead)} cada ` : "sem leads no período ",
        ok(cap.cost_per_lead) && ok(T.cost_per_lead) ? badge(cap.cost_per_lead <= T.cost_per_lead ? "ok" : cap.cost_per_lead <= T.cost_per_lead * 1.6 ? "warn" : "crit", cap.cost_per_lead <= T.cost_per_lead ? "na meta" : "atenção") : null) }),
    tile({ label: "Alcance", value: fmt.int(reach), delta: deltaBadge(all.reach, prevAll.reach), sub: `${reachNote} · freq. ${fmt.dec(exact?.frequency ?? all.frequency)}` }),
    tile({ label: "Cliques no link", value: fmt.int(all.link_clicks), delta: deltaBadge(all.link_clicks, prevAll.link_clicks), sub: `CTR ${fmt.pct(all.ctr)} · CPC ${fmt.brl(all.cpc)}` }),
    tile({ label: "CPM médio", value: fmt.brl(all.cpm), delta: deltaBadge(all.cpm, prevAll.cpm, { goodWhenUp: false, kind: "brl" }), sub: `${fmt.int(all.impressions)} impressões` }),
  );
  // a loja ainda registra contato (clique no WhatsApp); a linha de captação fica embaixo quando houver
  const kpisCaptacao = temVenda && temCaptacao ? h("div", { class: "grid c3" },
    tile({ label: "Contatos", value: fmt.int(all.contacts), delta: deltaBadge(all.contacts, prevAll.contacts), sub: "evento Contact do pixel — na loja, é o clique no WhatsApp" }),
    tile({ label: "Leads no site", value: fmt.int(all.leads), delta: deltaBadge(all.leads, prevAll.leads), sub: ok(all.cost_per_lead) ? `${fmt.brl(all.cost_per_lead)} cada (sobre o gasto total)` : "sem leads no período" }),
    tile({ label: "Alcance", value: fmt.int(reach), delta: deltaBadge(all.reach, prevAll.reach), sub: `${reachNote} · freq. ${fmt.dec(exact?.frequency ?? all.frequency)}` }),
  ) : null;

  // o selo da barra segue o custo por contato, que é a conversão de maior volume
  const nivelCap = !ok(cap.cost_per_contact) || !ok(T.cost_per_contact) ? null
    : cap.cost_per_contact <= T.cost_per_contact ? "ok"
    : cap.cost_per_contact <= T.cost_per_contact * 1.6 ? "warn" : "crit";
  const celula = (valor, rotulo) => h("div", {}, h("div", { class: "v", text: valor }), h("div", { class: "k", text: rotulo }));
  const metaBar = h("div", { class: "platform-bar" },
    h("div", { class: "head meta" },
      h("span", {}, "Meta Ads · captação ",
        nivelCap ? badge(nivelCap, nivelCap === "ok" ? "na meta" : nivelCap === "warn" ? "atenção" : "crítico") : null),
      h("span", { class: "meta-target", text: `meta ${fmt.brl(T.cost_per_contact)} por contato` })),
    h("div", { class: "body" },
      celula(fmt.brl(cap.spend), "investido em captação"),
      celula(fmt.int(cap.contacts), "contatos"),
      celula(fmt.brl(cap.cost_per_contact), "custo por contato"),
      celula(fmt.int(cap.leads), "leads no site"),
      celula(fmt.brl(cap.cost_per_lead), "custo por lead"),
      // só aparece em período que teve a campanha de WhatsApp no ar
      cap.conversations ? celula(fmt.int(cap.conversations), "conversas no WhatsApp") : null,
      cap.conversations ? celula(fmt.brl(cap.cost_per_conversation), "custo por conversa") : null,
    ),
  );
  const topoBar = h("div", { class: "platform-bar" },
    h("div", { class: "head", style: undefined }, h("span", {}, "Meta Ads · topo de funil"), h("span", { class: "meta-target faint", text: "alcance, reconhecimento e visitas ao perfil" })),
    h("div", { class: "body" },
      h("div", {}, h("div", { class: "v", text: fmt.brl(topo.spend) }), h("div", { class: "k", text: "investido" })),
      h("div", {}, h("div", { class: "v", text: fmt.int(topo.reach) }), h("div", { class: "k", text: "alcance (soma diária)" })),
      h("div", {}, h("div", { class: "v", text: fmt.brl(topo.cpm) }), h("div", { class: "k", text: "CPM" })),
    ),
  );
  $$(".head", topoBar)[0].classList.add("meta"); $$(".head", topoBar)[0].style.background = "var(--s7)";
  const asVenda = assess(venda, resolveResultDef(GOAL_RESULT.PURCHASE, m));
  const vendaBar = temVenda ? h("div", { class: "platform-bar" },
    h("div", { class: "head meta" },
      h("span", {}, "Meta Ads · vendas no site ", venda.spend > 0 ? badge(asVenda.level, asVenda.level === "ok" ? "na meta" : asVenda.level === "warn" ? "atenção" : asVenda.level === "crit" ? "crítico" : "sem meta") : null),
      h("span", { class: "meta-target", text: ok(T.cost_per_purchase) ? `meta ${fmt.brl(T.cost_per_purchase)} por compra` : ok(T.roas_min) ? `ROAS mínimo ${fmt.dec(T.roas_min)}` : "meta de ROAS/CPA a definir" })),
    h("div", { class: "body" },
      celula(fmt.brl(venda.spend), "investido em vendas"),
      celula(fmt.int(venda.purchases), "compras"),
      celula(fmt.brl(venda.cost_per_purchase), "custo por compra"),
      celula(fmt.brl(venda.revenue), "receita"),
      celula(venda.revenue > 0 ? fmt.dec(venda.roas) : "—", "ROAS"),
      celula(fmt.int(venda.checkouts), "checkouts"),
    ),
  ) : null;
  const barras = [vendaBar, !temVenda || temCaptacao ? metaBar : null, topo.spend > 0 || !temVenda ? topoBar : null].filter(Boolean);

  /* --- frentes (The Edit): um resultado por objetivo ----------------------- */
  const tFrente = (g) => {
    const r = resultsOf(g.agg, g.def), pg = frPrev.get(g.def.label);
    const cpr = costPerResult(g.agg, g.def), alvo = targetFor(g.def), as = assess(g.agg, g.def);
    return tile({ label: g.def.label, value: fmt.int(r), delta: deltaBadge(r, pg ? resultsOf(pg.agg, pg.def) : 0), accent: true,
      sub: h("span", {}, ok(cpr) ? `${g.def.per ? fmt.brl(cpr) + "/mil" : fmt.brl(cpr)} por ${g.def.unit}` : `sem ${g.def.unit} no período`,
        alvo ? ` · meta ${fmt.brl(alvo)} ` : " · sem meta ", alvo && ok(cpr) ? badge(as.level, nivelTxt(as.level)) : null) });
  };
  const kpisFrentes = frentesMode ? h("div", { class: "grid c4" },
    tile({ label: "Investimento no período", value: fmt.brl(all.spend), delta: deltaBadge(all.spend, prevAll.spend, { goodWhenUp: false, kind: "brl" }), accent: true,
      sub: fr.length ? fr.map((g) => `${curtoFrente(g.def)} ${fmt.brl(g.agg.spend)}`).join(" · ") : "sem investimento no período" }),
    ...frResult.map(tFrente),
    temApp ? tile({ label: "Cadastros no app", value: fmt.int(appAgg.app_registrations), delta: deltaBadge(appAgg.app_registrations, prevAppAgg.app_registrations), accent: true,
      sub: h("span", {}, ok(appAgg.cost_per_app_registration) ? `${fmt.brl(appAgg.cost_per_app_registration)} por cadastro` : "nenhum cadastro atribuído",
        ok(T.cost_per_app_registration) ? ` · meta ${fmt.brl(T.cost_per_app_registration)}` : " · sem meta") }) : null,
    tile({ label: "Alcance", value: fmt.int(reach), delta: deltaBadge(all.reach, prevAll.reach), sub: `${reachNote} · freq. ${fmt.dec(exact?.frequency ?? all.frequency)}` }),
    tile({ label: "Cliques no link", value: fmt.int(all.link_clicks), delta: deltaBadge(all.link_clicks, prevAll.link_clicks), sub: `CTR ${fmt.pct(all.link_ctr)} · CPC ${fmt.brl(all.link_cpc)}` }),
    tile({ label: "CPM médio", value: fmt.brl(all.cpm), delta: deltaBadge(all.cpm, prevAll.cpm, { goodWhenUp: false, kind: "brl" }), sub: `${fmt.int(all.impressions)} impressões` }),
  ) : null;
  const barraFrente = (g) => {
    const alvo = targetFor(g.def), as = assess(g.agg, g.def), r = resultsOf(g.agg, g.def), cpr = costPerResult(g.agg, g.def);
    const head = h("div", { class: "head meta" },
      h("span", {}, `Meta Ads · ${g.def.label.toLowerCase()} `, alvo && g.agg.spend > 0 ? badge(as.level, nivelTxt(as.level)) : null),
      h("span", { class: "meta-target", text: alvo ? `meta ${fmt.brl(alvo)} por ${g.def.unit}` : "sem meta definida" }));
    head.style.background = corFrente(g.def);
    return h("div", { class: "platform-bar" }, head, h("div", { class: "body" },
      celula(fmt.brl(g.agg.spend), "investido"),
      celula(fmt.int(r), g.def.label.toLowerCase()),
      celula(g.def.per ? `${fmt.brl(cpr)}/mil` : fmt.brl(cpr), `custo por ${g.def.unit}`),
      g.def.kind === "app" ? celula(fmt.int(g.agg.app_registrations), "cadastros no app") : celula(fmt.pct(g.agg.link_ctr), "CTR do link"),
      celula(fmt.brl(g.agg.cpm), "CPM"),
    ));
  };
  const barrasFrentes = fr.map(barraFrente);

  /* --- evolução diária ----------------------------------------------------- */
  const days = []; for (let d = state.since; d <= state.until; d = addDays(d, 1)) days.push(d);
  const byDay = groupBy(rows, "date");
  const byDayCap = groupBy(rows.filter((r) => isCaptacao(r.campaign_id)), "date");
  const byDayTopo = groupBy(rows.filter((r) => !isCaptacao(r.campaign_id)), "date");
  const labels = days.map(fmt.dm);
  const charts = temVenda ? h("div", { class: "grid c3" },
    chartCard("Funil por dia", "carrinho, checkout e compra", [
      { name: "Carrinho", color: "#9085e9", values: days.map((d) => byDay.get(d)?.carts || 0) },
      { name: "Checkout", color: "#c98500", values: days.map((d) => byDay.get(d)?.checkouts || 0) },
      { name: "Compra", color: "#199e70", values: days.map((d) => byDay.get(d)?.purchases || 0) },
    ], { labels, type: "bar", stacked: false }),
    chartCard("Receita × investimento", "por dia · receita das compras atribuídas ao Meta", [
      { name: "Investimento", color: "#3987e5", values: days.map((d) => byDay.get(d)?.spend || 0) },
      { name: "Receita", color: "#199e70", values: days.map((d) => byDay.get(d)?.revenue || 0) },
    ], { labels, type: "bar", stacked: false, format: fmt.brl }),
    chartCard("Custo por checkout, por dia", "investimento do dia ÷ checkouts iniciados", [{ name: "Custo/checkout", color: "#c98500", values: days.map((d) => byDay.get(d)?.cost_per_checkout ?? null) }], { labels, type: "line", format: fmt.brl }),
  ) : h("div", { class: "grid c3" },
    chartCard("Captação por dia", "contatos e leads no site", [
      { name: "Contatos", color: "var(--meta)", values: days.map((d) => byDay.get(d)?.contacts || 0) },
      { name: "Leads no site", color: "#c98500", values: days.map((d) => byDay.get(d)?.leads || 0) },
      ...(all.conversations ? [{ name: "Conversas (WhatsApp)", color: "#9085e9", values: days.map((d) => byDay.get(d)?.conversations || 0) }] : []),
    ], { labels, type: "bar", stacked: true }),
    chartCard("Investimento por dia", "captação e topo de funil", [
      { name: "Captação", color: "#3987e5", values: days.map((d) => byDayCap.get(d)?.spend || 0) },
      { name: "Topo de funil", color: "#9085e9", values: days.map((d) => byDayTopo.get(d)?.spend || 0) },
    ], { labels, type: "bar", stacked: true, format: fmt.brl }),
    chartCard("Custo por contato, por dia", "gasto em captação ÷ contatos do dia", [{ name: "Custo/contato", color: "#c98500", values: days.map((d) => byDayCap.get(d)?.cost_per_contact ?? null) }], { labels, type: "line", format: fmt.brl, target: T.cost_per_contact }),
  );

  const chartsFrentes = frentesMode ? h("div", { class: "grid c2" },
    chartCard("Investimento por dia", "empilhado por frente", fr.map((g) => { const bd = groupBy(g.rows, "date"); return { name: g.def.label, color: corFrente(g.def), values: days.map((d) => bd.get(d)?.spend || 0) }; }), { labels, type: "bar", stacked: true, format: fmt.brl }),
    ...frResult.map((g) => {
      const bd = groupBy(g.rows, "date");
      const sub = `${fmt.int(resultsOf(g.agg, g.def))} no período · ${fmt.brl(costPerResult(g.agg, g.def))} por ${g.def.unit}`;
      if (g.def.kind === "app") {
        return chartCard("Instalações e cadastros por dia", sub, [
          { name: "Instalações", color: corFrente(g.def), values: days.map((d) => bd.get(d)?.installs || 0) },
          { name: "Cadastros no app", color: "#c98500", values: days.map((d) => bd.get(d)?.app_registrations || 0) },
        ], { labels, type: "bar", stacked: false });
      }
      return chartCard(`${g.def.label} por dia`, sub, [{ name: g.def.label, color: corFrente(g.def), values: days.map((d) => (bd.get(d) ? resultsOf(bd.get(d), g.def) : 0)) }], { labels, type: "bar" });
    }),
  ) : null;

  /* --- histórico mensal ---------------------------------------------------- */
  const months = groupBy(m.daily.map((r) => ({ ...r, month: r.date.slice(0, 7) })), "month");
  const monthsCap = groupBy(m.daily.filter((r) => isCaptacao(r.campaign_id)).map((r) => ({ ...r, month: r.date.slice(0, 7) })), "month");
  const monthKeys = Array.from(months.keys()).sort();
  const histTable = h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Mês" }), h("th", { text: "Investimento" }), h("th", { text: "Captação" }), h("th", { text: "Contatos" }), h("th", { text: "Leads" }), h("th", { text: "Compras" }), h("th", { text: "Receita" }), h("th", { text: "ROAS" }), h("th", { text: "Custo/contato" }), h("th", { text: "Impressões" }), h("th", { text: "Alcance (soma)" }), h("th", { text: "CPM" }), h("th", { text: "Cliques" }), h("th", { text: "CTR" }), h("th", { text: "CPC" }))),
    h("tbody", {}, ...monthKeys.map((k) => {
      const a = months.get(k), c = monthsCap.get(k) || finish(emptyAgg());
      const partial = k === last.slice(0, 7);
      return h("tr", { class: partial ? "parcial" : "" },
        h("td", {}, `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)} `, partial ? h("span", { class: "badge warn", text: "parcial" }) : null),
        h("td", { text: fmt.brl(a.spend) }), h("td", { text: fmt.brl(c.spend) }),
        h("td", {}, fmt.int(a.contacts), a.conversations ? h("span", { class: "faint", text: ` +${fmt.int(a.conversations)} conv.` }) : null),
        h("td", { text: fmt.int(a.leads) }),
        h("td", { text: a.purchases || a.checkouts ? fmt.int(a.purchases) : "—" }), h("td", { text: a.revenue ? fmt.brl(a.revenue) : "—" }), h("td", { text: a.revenue ? fmt.dec(a.roas) : "—" }),
        h("td", { text: fmt.brl(c.cost_per_contact) }),
        h("td", { text: fmt.int(a.impressions) }), h("td", { text: fmt.int(a.reach) }), h("td", { text: fmt.brl(a.cpm) }), h("td", { text: fmt.int(a.clicks) }), h("td", { text: fmt.pct(a.ctr) }), h("td", { text: fmt.brl(a.cpc) }));
    })),
  ));

  let histFrentes = null;
  if (frentesMode) {
    const porMes = new Map();
    for (const r of m.daily) { const k = r.date.slice(0, 7); if (!porMes.has(k)) porMes.set(k, []); porMes.get(k).push(r); }
    const frHist = frentes(m.daily).filter((g) => g.def.kind !== "awareness").slice(0, 4);
    histFrentes = h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Mês" }), h("th", { text: "Investimento" }), ...frHist.map((g) => h("th", { text: g.def.label })), temApp ? h("th", { text: "Cadastros app" }) : null,
        h("th", { text: "Impressões" }), h("th", { text: "Alcance (soma)" }), h("th", { text: "CPM" }), h("th", { text: "Cliques no link" }), h("th", { text: "CTR" }), h("th", { text: "CPC" }))),
      h("tbody", {}, ...monthKeys.map((k) => {
        const a = months.get(k);
        const porFrente = new Map(frentes(porMes.get(k) || []).map((g) => [g.def.label, g]));
        const partial = k === last.slice(0, 7);
        return h("tr", { class: partial ? "parcial" : "" },
          h("td", {}, `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)} `, partial ? h("span", { class: "badge warn", text: "parcial" }) : null),
          h("td", { text: fmt.brl(a.spend) }),
          ...frHist.map((g) => { const x = porFrente.get(g.def.label); const r = x ? resultsOf(x.agg, x.def) : 0; return h("td", {}, fmt.int(r), x && r ? h("span", { class: "faint", text: ` · ${fmt.brl(costPerResult(x.agg, x.def))}` }) : null); }),
          temApp ? h("td", { text: fmt.int(a.app_registrations) }) : null,
          h("td", { text: fmt.int(a.impressions) }), h("td", { text: fmt.int(a.reach) }), h("td", { text: fmt.brl(a.cpm) }), h("td", { text: fmt.int(a.link_clicks) }), h("td", { text: fmt.pct(a.link_ctr) }), h("td", { text: fmt.brl(a.link_cpc) }));
      })),
    ));
  }

  /* --- onde está o resultado ----------------------------------------------- */
  const byAd = groupBy(rows, "ad_id");
  const adRows = Array.from(byAd.entries()).map(([id, a]) => ({ id, ad: idx.ads.get(id), agg: a, def: resultDefFor(idx.campaignByAd.get(id)) })).filter((x) => x.ad);
  // nas frentes, "eficiente" é relativo à média da própria frente: visita na LP e instalação não se comparam
  const relevante = (def) => (frentesMode ? def?.kind !== "awareness" : isConv(def));
  const mediaFrente = new Map(fr.map((g) => [g.def.label, costPerResult(g.agg, g.def)]));
  const custoRel = (x) => (frentesMode ? costPerResult(x.agg, x.def) / (mediaFrente.get(x.def.label) || 1) : costPerResult(x.agg, x.def));
  const best = adRows.filter((x) => relevante(x.def) && resultsOf(x.agg, x.def) >= 2).sort((a, b) => custoRel(a) - custoRel(b)).slice(0, 6);
  const noReturn = adRows.filter((x) => relevante(x.def) && resultsOf(x.agg, x.def) === 0 && x.agg.spend > 0).sort((a, b) => b.agg.spend - a.agg.spend).slice(0, 6);
  const byCamp = groupBy(rows, "campaign_id");
  const campRows = Array.from(byCamp.entries()).map(([id, a]) => ({ id, c: idx.campaigns.get(id), agg: a, def: resultDefFor(id) })).filter((x) => x.c);
  const offTarget = campRows.map((x) => ({ ...x, as: assess(x.agg, x.def) })).filter((x) => x.as.level === "crit" || x.as.level === "warn").sort((a, b) => b.agg.spend - a.agg.spend).slice(0, 6);

  const listItem = (rank, cls, thumb, name, sub, link) => h("div", { class: "list-item" },
    h("span", { class: `rank ${cls}`, text: rank }),
    thumb ? h("img", { class: "thumb", src: thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null,
    h("div", { class: "txt" }, link ? h("div", { class: "n" }, h("a", { href: link, target: "_blank", rel: "noopener noreferrer", text: name })) : h("div", { class: "n", text: name }), h("div", { class: "s", text: sub })),
  );
  const results = h("div", { class: "grid c3" },
    h("div", { class: "card" }, h("h3", {}, "🏆 Criativos mais eficientes"), h("div", { class: "muted", text: frentesMode ? "menor custo frente à média da própria frente, com ao menos 2 resultados" : "menor custo por resultado, com ao menos 2 resultados" }),
      best.length ? h("div", { class: "list" }, ...best.map((x, i) => listItem(i + 1, "good", thumbOf(x.ad), x.ad.name, `${fmt.brl(costPerResult(x.agg, x.def))} · ${fmt.int(resultsOf(x.agg, x.def))} ${x.def.unit}${resultsOf(x.agg, x.def) === 1 ? "" : "s"} · ${fmt.brl(x.agg.spend)}`, adLink(x.ad)))) : h("div", { class: "empty", text: "Ainda não há criativos com 2+ resultados no período." })),
    h("div", { class: "card" }, h("h3", {}, "🔥 Dinheiro sem retorno"), h("div", { class: "muted", text: `${fmt.brl(sum(noReturn, (x) => x.agg.spend))} em ${noReturn.length} criativos ${frentesMode ? "" : "de conversão "}sem nenhum resultado` }),
      noReturn.length ? h("div", { class: "list" }, ...noReturn.map((x, i) => listItem(i + 1, "bad", thumbOf(x.ad), x.ad.name, `${fmt.brl(x.agg.spend)} · zero ${x.def.unit} · ${fmt.int(x.agg.link_clicks)} cliques${x.def.kind === "sale" ? ` · ${fmt.int(x.agg.carts)} carrinhos · ${fmt.int(x.agg.checkouts)} checkouts` : ""}`, adLink(x.ad)))) : h("div", { class: "empty", text: frentesMode ? "Nenhum criativo gastando sem resultado." : "Nenhum criativo de conversão gastando sem resultado." })),
    h("div", { class: "card" }, h("h3", {}, "⚠️ Campanhas fora da meta"), h("div", { class: "muted", text: `${fmt.brl(sum(offTarget, (x) => x.agg.spend))} em ${offTarget.length} campanhas` }),
      offTarget.length ? h("div", { class: "list" }, ...offTarget.map((x, i) => listItem(i + 1, x.as.level === "crit" ? "bad" : "", null, x.c.name, `${fmt.brl(x.agg.spend)} · ${x.def.label}: ${fmt.int(resultsOf(x.agg, x.def))} · ${x.as.text}`))) : h("div", { class: "empty", text: "Todas as campanhas com meta estão dentro do esperado." })),
  );

  /* --- qual ação tomar ----------------------------------------------------- */
  const alerts = buildAlerts({ rows, prevRows, cap, prevCap, all, campRows, adRows, projection, budget, monthAgg });
  const actions = h("div", { class: "alerts" }, ...(alerts.length ? alerts.map((a) => h("div", { class: `alert ${a.level}` }, h("div", { class: "t" }, badge(a.level, a.level === "crit" ? "crítico" : a.level === "warn" ? "atenção" : "na meta"), a.title), a.detail ? h("div", { class: "d", text: a.detail }) : null)) : [h("div", { class: "empty", text: "Sem alertas para o período." })]));

  sec.append(...[
    block("Controle de investimento", "ciclo mensal e distribuição do gasto", invest),
    frentesMode
      ? block("O que está acontecendo", `volume e eficiência por frente · ${fmt.date(state.since)} a ${fmt.date(state.until)}`, kpisFrentes, barrasFrentes.length ? h("div", { class: `grid ${barrasFrentes.length > 2 ? "c3" : "c2"}` }, ...barrasFrentes) : null)
      : block("O que está acontecendo", `volume e eficiência · ${fmt.date(state.since)} a ${fmt.date(state.until)}`, temVenda ? kpisLoja : kpis, kpisCaptacao, h("div", { class: `grid ${barras.length > 2 ? "c3" : "c2"}` }, ...barras)),
    temVenda ? block("Funil da loja", "do clique no anúncio até a compra · eventos atribuídos ao Meta no período", funilLoja(all)) : null,
    plataformasBlock(all),
    block("Como está evoluindo", "dia a dia do período selecionado", frentesMode ? chartsFrentes : charts),
    frentesMode
      ? block("Histórico mensal", "mês a mês desde o início — independe do filtro de período", histFrentes, h("div", { class: "faint", text: "Cada frente mostra o resultado e, ao lado, o custo por resultado do mês. Visitas ao perfil usam cliques no link como medida (a API não expõe a visita em si)." }))
      : block("Histórico mensal", "mês a mês desde o início — independe do filtro de período", histTable, h("div", { class: "faint", text: "“Captação” = campanhas com objetivo de conversa/cadastro/venda. Topo de funil (alcance, reconhecimento, visitas ao perfil) entra no investimento total, mas não no custo por conversa." })),
    block("Onde está o resultado", "e onde o dinheiro está parado", results),
    block("Qual ação tomar", "alertas priorizados por dinheiro em jogo", actions),
  ].filter(Boolean));
}
/* Funil da loja: cada etapa com volume, % da etapa anterior e custo por etapa. */
function funilLoja(a) {
  const etapas = [
    ["Cliques no link", a.link_clicks],
    ["Visualizações da página", a.lpv],
    ["Viu produto", a.views],
    ["Adicionou ao carrinho", a.carts],
    ["Iniciou checkout", a.checkouts],
    ["Informou pagamento", a.payments],
    ["Comprou", a.purchases],
  ];
  const max = Math.max(1, ...etapas.map((e) => e[1] || 0));
  // o maior vazamento entre carrinho, checkout e compra (só com volume mínimo para não ser ruído)
  let pior = null;
  for (let i = 4; i < etapas.length; i++) {
    const ant = etapas[i - 1][1], cur = etapas[i][1];
    if (ant >= 3) { const taxa = cur / ant; if (!pior || taxa < pior.taxa) pior = { de: etapas[i - 1][0], para: etapas[i][0], taxa, ant, perdidos: ant - cur }; }
  }
  const linhas = etapas.map(([nome, v], i) => {
    const ant = i > 0 ? etapas[i - 1][1] : null;
    const pct = ant ? (v / ant) * 100 : null;
    const custo = div(a.spend, v);
    return h("div", { class: "funil-row" },
      h("span", { class: "funil-n", text: nome }),
      progressBar((v / max) * 100, i >= 4 ? "good" : ""),
      h("b", { text: fmt.int(v) }),
      h("span", { class: "faint", text: ok(pct) ? `${fmt.dec1(pct)}% da etapa anterior` : "" }),
      h("span", { class: "faint", text: ok(custo) && v > 0 ? `${fmt.brl(custo)} cada` : "" }));
  });
  return h("div", { class: "card" },
    h("div", { class: "funil" }, ...linhas),
    pior ? h("div", { class: "muted funil-nota", text: `Maior perda: de “${pior.de}” para “${pior.para}” — ${fmt.int(pior.perdidos)} de ${fmt.int(pior.ant)} ficaram pelo caminho (só ${fmt.dec1(pior.taxa * 100)}% seguiram).` }) : null,
    h("div", { class: "faint funil-nota", text: "“Viu produto” pode passar das visualizações da página: a mesma pessoa abre vários produtos. Os números são os que o Meta atribui aos anúncios (até 7 dias depois do clique ou 1 dia depois de ver); o total de pedidos da loja está na Nuvemshop." }));
}

/* Meta × Google na mesma janela: é a pergunta “onde o dinheiro vende mais”. */
function plataformasBlock(metaAgg) {
  const gcfg = state.config.google_ads || {};
  if (!state.google || gcfg.brand_id !== state.brandId) return null;
  const ga = gAgg((state.google.daily || []).filter((r) => r.date >= state.since && r.date <= state.until));
  const linhas = [
    { nome: "Meta Ads", cor: "var(--meta)", invest: metaAgg.spend, cliques: metaAgg.link_clicks, compras: metaAgg.purchases, receita: metaAgg.revenue, extra: `${fmt.int(metaAgg.checkouts)} checkouts` },
    { nome: "Google Ads", cor: "var(--google)", invest: ga.cost, cliques: ga.clicks, compras: ga.conversions, receita: ga.value, extra: ga.all > ga.conversions ? `${fmt.conv(ga.all - ga.conversions)} contatos WhatsApp` : "" },
  ];
  const tot = { nome: "Total", invest: sum(linhas, (x) => x.invest), cliques: sum(linhas, (x) => x.cliques), compras: sum(linhas, (x) => x.compras), receita: sum(linhas, (x) => x.receita), extra: "" };
  const linha = (x, total) => h("tr", { class: total ? "total" : "" },
    h("td", {}, x.cor ? spanDot(x.cor) : null, " ", total ? h("b", { text: x.nome }) : x.nome),
    h("td", { text: fmt.brl(x.invest) }), h("td", { text: tot.invest ? `${fmt.dec1((x.invest / tot.invest) * 100)}%` : "—" }),
    h("td", { text: fmt.int(x.cliques) }), h("td", { text: fmt.brl(div(x.invest, x.cliques)) }),
    h("td", {}, fmt.conv(x.compras), x.extra ? h("span", { class: "faint", text: ` · ${x.extra}` }) : null),
    h("td", { text: fmt.brl(div(x.invest, x.compras)) }), h("td", { text: fmt.brl(x.receita) }),
    h("td", { text: x.receita > 0 ? fmt.dec(div(x.receita, x.invest)) : "—" }));
  return block("Desempenho por plataforma", `Meta × Google · ${fmt.date(state.since)} a ${fmt.date(state.until)}`,
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Plataforma" }), h("th", { text: "Investimento" }), h("th", { text: "% da verba" }), h("th", { text: "Cliques" }), h("th", { text: "Custo/clique" }), h("th", { text: "Compras" }), h("th", { text: "Custo/compra" }), h("th", { text: "Receita" }), h("th", { text: "ROAS" }))),
      h("tbody", {}, ...linhas.map((x) => linha(x, false)), linha(tot, true)))),
    h("div", { class: "faint", text: "Cada plataforma conta a venda pelo próprio critério de atribuição: se as duas reclamarem a mesma compra, ela aparece duas vezes no total. Clique no Meta = clique no link; no Google = qualquer clique no anúncio. O número real de pedidos está na Nuvemshop." }));
}
function spanDot(color) { const i = h("i", { class: "dot" }); i.style.background = color; return i; }

function buildAlerts({ rows, prevRows, cap, prevCap, all, campRows, adRows, projection, budget, monthAgg }) {
  const T = state.targets; const out = [];
  const money = (x) => x.agg.spend;
  const crit = campRows.map((x) => ({ ...x, as: assess(x.agg, x.def) })).filter((x) => x.as.level === "crit");
  const warn = campRows.map((x) => ({ ...x, as: assess(x.agg, x.def) })).filter((x) => x.as.level === "warn");
  const okc = campRows.map((x) => ({ ...x, as: assess(x.agg, x.def) })).filter((x) => x.as.level === "ok");
  if (crit.length) out.push({ level: "crit", title: `Meta: ${fmt.brl(sum(crit, money))} em ${crit.length} campanha${crit.length > 1 ? "s" : ""} em situação crítica`, detail: crit.sort((a, b) => money(b) - money(a)).slice(0, 3).map((x) => `${x.c.name} (${fmt.brl(x.agg.spend)}, ${x.as.text.toLowerCase()})`).join(" · ") });
  if (warn.length) out.push({ level: "warn", title: `Meta: ${fmt.brl(sum(warn, money))} em ${warn.length} campanha${warn.length > 1 ? "s" : ""} acima da meta`, detail: warn.sort((a, b) => money(b) - money(a)).slice(0, 3).map((x) => `${x.c.name} (${x.def.label.toLowerCase()} a ${fmt.brl(costPerResult(x.agg, x.def))})`).join(" · ") });
  // loja: onde o funil quebra. Anúncio que leva gente até o checkout está fazendo o trabalho dele.
  if (all && all.checkouts >= 5) {
    const minPct = T.checkout_to_purchase_min_pct ?? 30;
    const taxa = (all.purchases / all.checkouts) * 100;
    if (taxa < minPct) out.push({ level: all.purchases === 0 ? "crit" : "warn", title: `Só ${fmt.int(all.purchases)} de ${fmt.int(all.checkouts)} checkouts viraram compra (${fmt.dec1(taxa)}%)`, detail: `O esperado é acima de ${minPct}%. O anúncio está levando gente até o pagamento; o gargalo está na loja. Fazer uma compra teste, conferir frete, formas de pagamento e se a oferta aparece aplicada no carrinho. Ligar a recuperação de carrinho abandonado da Nuvemshop.` });
  }
  if (all && all.carts >= 10 && all.checkouts / all.carts < 0.2) out.push({ level: "warn", title: `${fmt.int(all.carts)} carrinhos e só ${fmt.int(all.checkouts)} checkouts`, detail: "A pessoa escolhe o produto e desiste antes de pagar. Conferir valor do frete e se o preço no carrinho bate com o anúncio." });
  const relevante = (def) => (modoFrentes() ? def?.kind !== "awareness" : isConv(def));
  const noRet = adRows.filter((x) => relevante(x.def) && resultsOf(x.agg, x.def) === 0 && x.agg.spend >= (T.min_spend_for_alert || 30));
  if (noRet.length) out.push({ level: "crit", title: `${fmt.brl(sum(noRet, money))} em ${noRet.length} criativo${noRet.length > 1 ? "s" : ""} ${modoFrentes() ? "" : "de conversão "}sem nenhum resultado`, detail: "Pausar e substituir por variações do criativo que melhor converte. " + noRet.slice(0, 3).map((x) => `${x.ad.name} (${fmt.brl(x.agg.spend)})`).join(" · ") });
  if (ok(cap.cost_per_contact) && ok(prevCap.cost_per_contact) && prevCap.contacts >= 3 && cap.cost_per_contact > prevCap.cost_per_contact * 1.25) {
    out.push({ level: "warn", title: `Custo por contato subiu ${nfDec1.format(((cap.cost_per_contact / prevCap.cost_per_contact) - 1) * 100)}% vs. período anterior`, detail: `${fmt.brl(prevCap.cost_per_contact)} → ${fmt.brl(cap.cost_per_contact)}. Verificar saturação de público (frequência), troca de criativo ou queda de CTR.` });
  }
  const highFreq = campRows.filter((x) => x.agg.frequency > (T.frequency_max || 2.5) && x.agg.spend > 20 && x.def.kind !== "awareness");
  if (highFreq.length) out.push({ level: "warn", title: `Frequência acima de ${fmt.dec1(T.frequency_max)} em ${highFreq.length} campanha${highFreq.length > 1 ? "s" : ""}`, detail: "Público saturando: ampliar segmentação ou renovar criativos. " + highFreq.map((x) => `${x.c.name} (${fmt.dec(x.agg.frequency)}×)`).join(" · ") });
  const lowCtr = campRows.filter((x) => x.def.kind !== "awareness" && x.agg.impressions > 1000 && x.agg.ctr < (T.ctr_min || 1));
  if (lowCtr.length) out.push({ level: "warn", title: `CTR abaixo de ${fmt.pct(T.ctr_min || 1)} em ${lowCtr.length} campanha${lowCtr.length > 1 ? "s" : ""}`, detail: "Criativo/gancho pouco atrativo para o público. " + lowCtr.map((x) => `${x.c.name} (${fmt.pct(x.agg.ctr)})`).join(" · ") });
  if (budget && projection > budget * 1.15) out.push({ level: "crit", title: `Projeção do mês (${fmt.brl(projection)}) estoura a verba de ${fmt.brl(budget)}`, detail: `Já gastos ${fmt.brl(monthAgg.spend)}. Reduzir orçamento diário das campanhas de topo de funil primeiro.` });
  else if (budget && projection < budget * 0.7 && rows.length) out.push({ level: "warn", title: `Projeção do mês (${fmt.brl(projection)}) fica bem abaixo da verba de ${fmt.brl(budget)}`, detail: "Há espaço para escalar as campanhas que estão na meta ou testar novos criativos." });
  if (okc.length) out.push({ level: "ok", title: `Meta: ${okc.length} campanha${okc.length > 1 ? "s" : ""} dentro da meta`, detail: okc.map((x) => `${x.c.name} (${x.def.label.toLowerCase()} a ${fmt.brl(costPerResult(x.agg, x.def))}${x.def.per ? "/mil" : ""}, ${fmt.int(resultsOf(x.agg, x.def))} resultados)`).join(" · ") });
  return out;
}

/* ======================================================= seção: Meta Ads */
function renderMeta() {
  const sec = $("#sec-meta"); sec.replaceChildren();
  const m = state.meta; const T = state.targets;
  const rows = rowsIn(state.since, state.until), prevRows = rowsIn(state.prevSince, state.prevUntil);
  const byCamp = groupBy(rows, "campaign_id"), prevByCamp = groupBy(prevRows, "campaign_id");
  const cap = aggregate(rows.filter((r) => isCaptacao(r.campaign_id)));
  const capDef = resolveResultDef(GOAL_RESULT.CONVERSATIONS);
  const campRows = m.campaigns.map((c) => ({ c, agg: byCamp.get(c.id) || finish(emptyAgg()), prev: prevByCamp.get(c.id), def: resultDefFor(c.id) }))
    .filter((x) => x.agg.spend > 0 || x.c.effective_status === "ACTIVE")
    .sort((a, b) => b.agg.spend - a.agg.spend);
  const withSpend = campRows.filter((x) => x.agg.spend > 0);
  const onTarget = withSpend.filter((x) => assess(x.agg, x.def).level === "ok");
  const temVenda = temVendaNa(m, idx);
  const venda = aggregate(rows.filter((r) => isVenda(r.campaign_id)));
  const bestCap = withSpend.filter((x) => isConv(x.def) && resultsOf(x.agg, x.def) > 0).sort((a, b) => costPerResult(a.agg, a.def) - costPerResult(b.agg, b.def))[0];
  const frentesMode = modoFrentes();
  const frM = frentesMode ? frentes(rows) : [];
  const mediaM = new Map(frM.map((g) => [g.def.label, costPerResult(g.agg, g.def)]));
  const relM = (x) => costPerResult(x.agg, x.def) / (mediaM.get(x.def.label) || 1);
  const bestFrente = frentesMode ? withSpend.filter((x) => x.def.kind !== "awareness" && resultsOf(x.agg, x.def) > 0).sort((a, b) => relM(a) - relM(b))[0] : null;
  const barraMetaFrentes = frentesMode ? h("div", { class: "platform-bar" },
    h("div", { class: "head meta" }, h("span", {}, "Meta Ads "), h("span", { class: "meta-target", text: "metas por frente no menu lateral" })),
    h("div", { class: "body" },
      h("div", {}, h("div", { class: "v", text: fmt.brl(sum(frM, (g) => g.agg.spend)) }), h("div", { class: "k", text: "investido" })),
      ...frM.filter((g) => g.def.kind !== "awareness").slice(0, 3).map((g) => h("div", {}, h("div", { class: "v", text: fmt.int(resultsOf(g.agg, g.def)) }), h("div", { class: "k", text: curtoFrente(g.def) === "App" ? "instalações" : g.def.label.toLowerCase() }))),
    )) : null;

  const head = h("div", { class: "grid c4" },
    frentesMode ? barraMetaFrentes : h("div", { class: "platform-bar", style: undefined },
      h("div", { class: "head meta" }, h("span", {}, "Meta Ads "), h("span", { class: "meta-target", text: temVenda ? (ok(T.cost_per_purchase) ? `meta ${fmt.brl(T.cost_per_purchase)} por compra` : "meta de ROAS/CPA a definir") : `meta ${fmt.brl(T.cost_per_contact)} por contato` })),
      temVenda ? h("div", { class: "body" },
        h("div", {}, h("div", { class: "v", text: fmt.brl(venda.spend) }), h("div", { class: "k", text: "investido em vendas" })),
        h("div", {}, h("div", { class: "v", text: fmt.int(venda.purchases) }), h("div", { class: "k", text: "compras" })),
        h("div", {}, h("div", { class: "v", text: venda.revenue > 0 ? fmt.dec(venda.roas) : "—" }), h("div", { class: "k", text: "ROAS" })),
      ) : h("div", { class: "body" },
        h("div", {}, h("div", { class: "v", text: fmt.brl(cap.spend) }), h("div", { class: "k", text: "investido em captação" })),
        h("div", {}, h("div", { class: "v", text: fmt.int(cap.contacts) }), h("div", { class: "k", text: "contatos" })),
        h("div", {}, h("div", { class: "v", text: fmt.int(cap.leads) }), h("div", { class: "k", text: "leads no site" })),
      )),
    tile({ label: "Campanhas", value: fmt.int(campRows.length), sub: `${withSpend.length} com investimento no período` }),
    (() => {
      // só conta quem tem meta: sem meta acordada, "0% na meta" seria um alarme falso
      const comMeta = withSpend.filter((x) => targetFor(x.def));
      const naMeta = comMeta.filter((x) => assess(x.agg, x.def).level === "ok");
      if (!comMeta.length) return tile({ label: "Dentro da meta", value: "—", sub: "nenhuma meta definida — edite no menu lateral" });
      return tile({ label: "Dentro da meta", value: fmt.int(naMeta.length), sub: h("span", {}, `de ${comMeta.length} com meta`, badge(naMeta.length === comMeta.length ? "ok" : naMeta.length ? "warn" : "crit", `${Math.round((naMeta.length / comMeta.length) * 100)}%`)) });
    })(),
    frentesMode ? tile({ label: "Melhor campanha", value: bestFrente ? fmt.brl(costPerResult(bestFrente.agg, bestFrente.def)) : "—",
      sub: bestFrente ? h("span", {}, bestFrente.c.name, " ", badge(assess(bestFrente.agg, bestFrente.def).level, `por ${bestFrente.def.unit}`)) : "sem resultados no período" })
    : tile({ label: "Melhor campanha de conversão", value: bestCap ? fmt.brl(costPerResult(bestCap.agg, bestCap.def)) : "—", sub: bestCap ? h("span", {}, bestCap.c.name, " ", badge(assess(bestCap.agg, bestCap.def).level, `por ${bestCap.def.unit}`)) : "sem resultados no período" }),
  );

  const table = h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Status" }), h("th", { class: "l", text: "Campanha" }), h("th", { text: "Orçam./dia" }), h("th", { text: "Result." }), h("th", { text: "Custo/result." }), h("th", { text: "Impress." }), h("th", { text: "Alcance" }), h("th", { text: "CPM" }), h("th", { text: "CTR" }), h("th", { text: "Cliques" }), h("th", { text: "CPC" }), h("th", { text: "Gasto" }), h("th", { class: "l", text: "Ação" }))),
    h("tbody", {}, ...campRows.map((x) => campaignRow(x))),
  ));

  /* conjuntos por campanha */
  const byAdset = groupBy(rows, "adset_id"), prevByAdset = groupBy(prevRows, "adset_id");
  const groups = campRows.map((x) => {
    const sets = m.adsets.filter((s) => s.campaign_id === x.c.id).map((s) => ({ c: s, agg: byAdset.get(s.id) || finish(emptyAgg()), prev: prevByAdset.get(s.id), def: x.def, parent: x.c })).filter((y) => y.agg.spend > 0 || y.c.effective_status === "ACTIVE").sort((a, b) => b.agg.spend - a.agg.spend);
    if (!sets.length) return null;
    const details = h("details", { open: x === campRows[0] ? "" : null },
      h("summary", { class: "group-head" }, h("span", {}, x.c.name), h("small", { text: `${sets.length} conjunto${sets.length > 1 ? "s" : ""} · ${fmt.brl(x.agg.spend)} · ${x.def.label.toLowerCase()}: ${fmt.int(resultsOf(x.agg, x.def))} · ${sets.filter((s) => assess(s.agg, s.def).level === "ok").length} na meta` })),
      h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Status" }), h("th", { class: "l", text: "Conjunto" }), h("th", { text: "Orçam./dia" }), h("th", { text: "Result." }), h("th", { text: "Custo/result." }), h("th", { text: "Impress." }), h("th", { text: "Alcance" }), h("th", { text: "CPM" }), h("th", { text: "CTR" }), h("th", { text: "Cliques" }), h("th", { text: "CPC" }), h("th", { text: "Gasto" }), h("th", { class: "l", text: "Ação" }))),
        h("tbody", {}, ...sets.map((y) => campaignRow(y, true)))),
    );
    return details;
  }).filter(Boolean);

  /* breakdowns (últimos 30 dias) */
  const bd = m.breakdowns || {};
  const agrupa = (lista, chave) => {
    const map = new Map();
    for (const r of lista || []) { const k = chave(r); if (!map.has(k)) map.set(k, emptyAgg()); addRow(map.get(k), r); }
    return Array.from(map.entries()).map(([k, a]) => [k, finish(a)]).sort((a, b) => b[1].spend - a[1].spend).slice(0, 10);
  };
  // na loja as colunas são do funil de venda; nas marcas de captação, contato
  const temLpv = frM.some((g) => g.def.label === "Visualizações da página"), temInst = frM.some((g) => g.def.kind === "app");
  const colsFrentes = [["Gasto", (a) => fmt.brl(a.spend)], ...(temLpv ? [["Visitas LP", (a) => fmt.int(a.lpv)]] : []),
    ...(temInst ? [["Instalações", (a) => fmt.int(a.installs)], ["CPI", (a) => fmt.brl(a.cost_per_install)]] : []),
    ["Cliques", (a) => fmt.int(a.link_clicks)], ["CTR", (a) => fmt.pct(a.link_ctr)], ["CPC", (a) => fmt.brl(a.link_cpc)]];
  const bdTabela = (titulo, nota, list, rotulo) => {
    const fundo = sum(list, ([, a]) => a.purchases) > 0;
    const cols = frentesMode ? colsFrentes : temVenda
      ? [["Gasto", (a) => fmt.brl(a.spend)], ["CPC", (a) => fmt.brl(a.link_cpc)], ["Carrinho", (a) => fmt.int(a.carts)], ["Checkout", (a) => fmt.int(a.checkouts)], ["Compras", (a) => fmt.int(a.purchases)],
         fundo ? ["ROAS", (a) => (a.revenue > 0 ? fmt.dec(a.roas) : "—")] : ["R$/checkout", (a) => fmt.brl(a.cost_per_checkout)]]
      : [["Gasto", (a) => fmt.brl(a.spend)], ["Contatos", (a) => fmt.int(a.contacts)], ["Custo/contato", (a) => fmt.brl(a.cost_per_contact)], ["CTR", (a) => fmt.pct(a.ctr)]];
    return h("div", { class: "table-wrap" }, h("div", { class: "group-head" }, h("span", { text: titulo }), h("small", { text: nota })),
      h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: rotulo }), ...cols.map(([t]) => h("th", { text: t })))),
        h("tbody", {}, ...list.map(([k, a]) => h("tr", {}, h("td", { text: k }), ...cols.map(([, f]) => h("td", { text: f(a) })))))));
  };
  const APARELHO = { iphone: "iPhone", ipad: "iPad", android_smartphone: "Android", android_tablet: "Tablet Android", desktop: "Computador", other: "Outro" };
  const PLATAFORMA = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger", threads: "Threads" };
  const bdCards = [];
  if (bd.platform_position?.length) bdCards.push(bdTabela("Plataforma", "últimos 30 dias", agrupa(bd.platform_position, (r) => PLATAFORMA[r.publisher_platform] || r.publisher_platform || "?"), "Plataforma"));
  if (bd.platform_position?.length) bdCards.push(bdTabela("Posicionamento", "últimos 30 dias", agrupa(bd.platform_position, (r) => `${PLATAFORMA[r.publisher_platform] || r.publisher_platform || "?"} · ${(r.platform_position || "").replace(/^(facebook|instagram)_/, "").replace(/_/g, " ")}`), "Posicionamento"));
  if (bd.device?.length) bdCards.push(bdTabela("Aparelho", "últimos 30 dias · onde o anúncio foi visto", agrupa(bd.device, (r) => APARELHO[r.impression_device] || r.impression_device || "?"), "Aparelho"));
  if (bd.age_gender?.length) bdCards.push(bdTabela("Idade e gênero", "últimos 30 dias · todas as campanhas", agrupa(bd.age_gender, (r) => `${r.age} · ${r.gender === "female" ? "F" : r.gender === "male" ? "M" : "?"}`), "Faixa"));
  if (bd.region?.length) bdCards.push(bdTabela("Região (estado)", "últimos 30 dias", agrupa(bd.region, (r) => r.region || "—"), "Região"));

  sec.append(...[
    block("Meta Ads", `${fmt.date(state.since)} a ${fmt.date(state.until)} · ${frentesMode ? "resultado de cada campanha conforme a meta de otimização" : temVenda ? (ok(T.cost_per_purchase) ? `meta de ${fmt.brl(T.cost_per_purchase)} por compra` : "custo por compra ainda sem meta") : `meta de ${fmt.brl(T.cost_per_contact)} por contato`}`, head, table),
    block("Conjuntos por campanha", "orçamento é definido no conjunto quando a campanha não usa CBO", ...(groups.length ? groups.map((g) => h("div", { class: "table-wrap" }, g)) : [h("div", { class: "empty", text: "Sem conjuntos com dados no período." })])),
    bdCards.length ? block(temVenda ? "Onde vende melhor" : "Quem está respondendo", temVenda ? "plataforma, posicionamento, aparelho e público · carrinho, checkout e compra atribuídos ao Meta" : frentesMode ? "distribuição do gasto, das visitas e das instalações · últimos 30 dias" : "distribuição do gasto e das conversas", h("div", { class: `grid ${temVenda || frentesMode ? "c2" : "c3"}` }, ...bdCards)) : null,
  ].filter(Boolean));
}
function campaignRow(x, isAdset = false) {
  const { c, agg, prev, def } = x;
  const as = assess(agg, def);
  const results = resultsOf(agg, def);
  const prevResults = prev ? resultsOf(prev, def) : null;
  const goal = isAdset ? c.optimization_goal : null;
  const tg = isAdset ? c.targeting : null;
  const nameCell = h("td", { class: "name" },
    h("div", { class: "n", text: c.name }),
    h("div", { class: "s", text: isAdset ? `${x.parent?.name || ""}${goal ? " · " + (GOAL_RESULT[goal]?.label || goal) : ""}` : `${OBJECTIVE_LABEL[c.objective] || c.objective || ""} · ${def.label}${def.proxy ? " (" + def.proxy + ")" : ""}` }),
    def.kind === "sale" && agg.spend > 0 ? h("div", { class: "s", text: `${fmt.int(agg.carts)} carrinhos · ${fmt.int(agg.checkouts)} checkouts · receita ${fmt.brl(agg.revenue)}${agg.revenue > 0 ? ` · ROAS ${fmt.dec(agg.roas)}` : ""}` }) : null,
    tg ? h("div", {}, tg.age_min ? h("span", { class: "tag", text: `${tg.age_min}–${tg.age_max || "65+"}` }) : null, tg.advantage_audience ? h("span", { class: "tag", text: "Advantage+" }) : null, ...(tg.geo || []).slice(0, 4).map((g) => h("span", { class: "tag", text: g }))) : null,
  );
  const budget = c.daily_budget > 0 ? fmt.brl(c.daily_budget) : c.lifetime_budget > 0 ? `${fmt.brl(c.lifetime_budget)} total` : "—";
  return h("tr", {},
    h("td", {}, statusBadge(c.effective_status, c.status)),
    nameCell,
    h("td", { text: budget }),
    h("td", {}, h("b", { text: fmt.int(results) }), " ", prevResults != null ? deltaBadge(results, prevResults) : null),
    h("td", {}, cprCell(agg, def)),
    h("td", { text: fmt.int(agg.impressions) }),
    h("td", { text: fmt.int(agg.reach) }),
    h("td", { text: fmt.brl(agg.cpm) }),
    h("td", { text: fmt.pct(agg.ctr) }),
    h("td", { text: fmt.int(agg.clicks) }),
    h("td", { text: fmt.brl(agg.cpc) }),
    h("td", { text: fmt.brl(agg.spend) }),
    h("td", { class: "act-cell" }, h("div", { class: "act" }, badge(as.level, as.level === "ok" ? "na meta" : as.level === "warn" ? "atenção" : as.level === "crit" ? "crítico" : "sem meta"), h("span", { text: as.text }))),
  );
}

/* ====================================================== seção: criativos */
function renderCreatives() {
  const sec = $("#sec-criativos"); sec.replaceChildren();
  const m = state.meta;
  const rows = rowsIn(state.since, state.until);
  const byAd = groupBy(rows, "ad_id");
  let items = m.ads.map((ad) => ({ ad, agg: byAd.get(ad.id) || finish(emptyAgg()), def: resultDefFor(ad.campaign_id), camp: idx.campaigns.get(ad.campaign_id), set: idx.adsets.get(ad.adset_id) }))
    .map((x) => ({ ...x, as: assess(x.agg, x.def) }))
    .filter((x) => x.agg.spend > 0 || x.ad.effective_status === "ACTIVE");
  const f = state.creativeFilter;
  const campaignsWithAds = m.campaigns.filter((c) => items.some((x) => x.ad.campaign_id === c.id));
  if (f.campaign !== "all") items = items.filter((x) => x.ad.campaign_id === f.campaign);
  if (f.quality !== "all") items = items.filter((x) => x.as.level === f.quality);
  items.sort((a, b) => b.agg.spend - a.agg.spend);

  const sel = h("select", { onchange: (e) => { state.creativeFilter.campaign = e.target.value; renderCreatives(); } }, h("option", { value: "all", text: "Todas as campanhas" }), ...campaignsWithAds.map((c) => h("option", { value: c.id, text: c.name, selected: f.campaign === c.id ? "" : null })));
  const chips = ["all", "ok", "warn", "crit"].map((q) => h("button", { type: "button", class: `chip${f.quality === q ? " on" : ""}`, text: q === "all" ? "Todos" : q === "ok" ? "● Na meta" : q === "warn" ? "▲ Atenção" : "■ Crítico", onclick: () => { state.creativeFilter.quality = q; renderCreatives(); } }));
  const filters = h("div", { class: "filter-row" }, h("span", { text: "Campanha" }), sel, h("span", { text: "Qualidade" }), ...chips, h("span", { class: "faint", text: `${items.length} criativos · ${fmt.brl(sum(items, (x) => x.agg.spend))} investido` }));

  const cards = h("div", { class: "cards" }, ...items.map((x) => {
    const thumb = thumbOf(x.ad), link = adLink(x.ad);
    const r = resultsOf(x.agg, x.def), cpr = costPerResult(x.agg, x.def);
    return h("div", { class: `creative ${x.as.level}` },
      h("div", { class: "img" }, thumb ? h("img", { src: thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null, link ? h("a", { href: link, target: "_blank", rel: "noopener noreferrer", text: "abrir ↗" }) : null),
      h("div", { class: "body" },
        h("div", { class: "badges" }, statusBadge(x.ad.effective_status, x.ad.status), badge(x.as.level, x.as.level === "ok" ? "na meta" : x.as.level === "warn" ? "atenção" : x.as.level === "crit" ? "crítico" : "sem meta"), x.ad.creative?.object_type ? h("span", { class: "badge neutral", text: x.ad.creative.object_type.toLowerCase().replace("_", " ") }) : null),
        h("div", { class: "n", text: x.ad.name }),
        h("div", { class: "s", text: `${x.camp?.name || ""} · ${x.set?.name || ""}` }),
        h("div", { class: "m" }, h("span", {}, h("b", { text: fmt.brl(x.agg.spend) }), " gasto"), h("span", {}, h("b", { text: fmt.int(r) }), ` ${x.def.unit}${r === 1 ? "" : "s"}`), h("span", {}, h("b", { text: ok(cpr) ? (x.def.per ? fmt.brl(cpr) + "/mil" : fmt.brl(cpr)) : "—" }), ` por ${x.def.unit}`)),
        h("div", { class: "m" }, h("span", {}, h("b", { text: fmt.pct(x.agg.ctr) }), " CTR"), h("span", {}, h("b", { text: fmt.brl(x.agg.cpm) }), " CPM"), h("span", {}, h("b", { text: fmt.int(x.agg.link_clicks) }), " cliques"), x.agg.thruplays ? h("span", {}, h("b", { text: fmt.int(x.agg.thruplays) }), " thruplays") : null),
        x.def.kind === "sale" && x.agg.spend > 0 ? h("div", { class: "m" }, h("span", {}, h("b", { text: fmt.int(x.agg.carts) }), " carrinhos"), h("span", {}, h("b", { text: fmt.int(x.agg.checkouts) }), " checkouts"), h("span", {}, h("b", { text: fmt.brl(x.agg.revenue) }), " receita"), x.agg.revenue > 0 ? h("span", {}, h("b", { text: fmt.dec(x.agg.roas) }), " ROAS") : null) : null,
        x.ad.creative?.body ? h("div", { class: "copy", text: x.ad.creative.body }) : null,
      ),
    );
  }));
  sec.append(block("Criativos com entrega", "clique em “abrir” para ver o anúncio publicado", filters, items.length ? cards : h("div", { class: "empty", text: "Nenhum criativo para este filtro." })));
}

/* ======================================================= seção: orgânico */
function seriesLast(arr, days) { if (!arr?.length) return []; const cut = addDays(state.meta.range.until, -(days - 1)); return arr.filter((p) => p.date >= cut); }
function renderOrganic() {
  const sec = $("#sec-organico"); sec.replaceChildren();
  const o = state.organic;
  if (!o) { sec.append(block("Orgânico", "Instagram e Facebook", h("div", { class: "placeholder" }, h("b", { text: "Dados orgânicos ainda não coletados" }), h("span", { text: "O coletor gera organic.json quando o token tiver as permissões pages_read_engagement, read_insights, instagram_basic e instagram_manage_insights." })))); return; }
  const ig = o.instagram, fb = o.facebook;
  if (o.warnings?.length) sec.append(h("div", { class: "banner" }, h("b", { text: "Avisos da coleta orgânica: " }), h("ul", {}, ...o.warnings.slice(0, 8).map((w) => h("li", { text: w })))));

  if (ig) {
    const reach30 = seriesLast(ig.daily?.reach, 30), reachPrev = ig.daily?.reach ? ig.daily.reach.filter((p) => p.date < addDays(state.range.until, -29) && p.date >= addDays(state.range.until, -59)) : [];
    const foll30 = seriesLast(ig.daily?.follower_count, 30);
    const t30 = ig.totals?.last_30d || {}, t7 = ig.totals?.last_7d || {};
    const pv30 = seriesLast(ig.daily?.profile_views, 30), ae30 = seriesLast(ig.daily?.accounts_engaged, 30);
    const tiles = h("div", { class: "grid c6" },
      tile({ label: "Seguidores", value: fmt.int(ig.followers), sub: `${fmt.int(ig.media_count)} publicações · segue ${fmt.int(ig.follows)}`, accent: true }),
      tile({ label: "Novos seguidores (30d)", value: foll30.length ? "+" + fmt.int(sum(foll30, (p) => p.value)) : "—", sub: foll30.length ? `${fmt.dec1(sum(foll30, (p) => p.value) / foll30.length)} por dia` : "série indisponível" }),
      tile({ label: "Alcance (30d)", value: reach30.length ? fmt.int(sum(reach30, (p) => p.value)) : "—", delta: reachPrev.length ? deltaBadge(sum(reach30, (p) => p.value), sum(reachPrev, (p) => p.value)) : null, sub: "soma do alcance diário" }),
      tile({ label: "Visitas ao perfil (30d)", value: fmt.int(t30.profile_views ?? (pv30.length ? sum(pv30, (p) => p.value) : null)), sub: `7d: ${fmt.int(t7.profile_views)}` }),
      tile({ label: "Contas engajadas (30d)", value: fmt.int(t30.accounts_engaged ?? (ae30.length ? sum(ae30, (p) => p.value) : null)), sub: `interações: ${fmt.int(t30.total_interactions)}` }),
      tile({ label: "Visualizações (30d)", value: fmt.int(t30.views), sub: `cliques no site: ${fmt.int(t30.website_clicks)}` }),
    );
    const charts = h("div", { class: "grid c2" });
    if (reach30.length) charts.append(chartCard("Alcance diário · Instagram", "últimos 30 dias (orgânico + pago)", [{ name: "Alcance", color: "#d55181", values: reach30.map((p) => p.value) }], { labels: reach30.map((p) => fmt.dm(p.date)), type: "bar" }));
    if (foll30.length) charts.append(chartCard("Novos seguidores por dia", "últimos 30 dias", [{ name: "Seguidores", color: "#199e70", values: foll30.map((p) => p.value) }], { labels: foll30.map((p) => fmt.dm(p.date)), type: "bar" }));
    if (pv30.length) charts.append(chartCard("Visitas ao perfil por dia", "últimos 30 dias", [{ name: "Visitas", color: "#3987e5", values: pv30.map((p) => p.value) }], { labels: pv30.map((p) => fmt.dm(p.date)), type: "bar" }));
    if (ae30.length) charts.append(chartCard("Contas engajadas por dia", "últimos 30 dias", [{ name: "Contas", color: "#c98500", values: ae30.map((p) => p.value) }], { labels: ae30.map((p) => fmt.dm(p.date)), type: "bar" }));

    const medias = (ig.media || []).map((x) => { const i = x.insights || {}; const inter = (x.likes || 0) + (x.comments || 0) + (i.saved || 0) + (i.shares || 0); return { ...x, inter, reach: i.reach || 0, rate: i.reach ? (inter / i.reach) * 100 : null }; }).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const grid = h("div", { class: "media-grid" }, ...medias.slice(0, 24).map((x) => h("div", { class: "media" },
      h("a", { href: x.permalink, target: "_blank", rel: "noopener noreferrer" }, h("div", { class: "pic" }, x.thumbnail ? h("img", { src: x.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null, h("span", { class: "type", text: (x.product_type || x.media_type || "").toLowerCase() }))),
      h("div", { class: "info" }, h("div", { class: "d", text: fmt.date((x.timestamp || "").slice(0, 10)) }),
        h("div", { class: "k" }, h("span", { text: "Alcance" }), h("b", { text: fmt.int(x.reach || null) })),
        h("div", { class: "k" }, h("span", { text: "Curtidas · coment." }), h("b", { text: `${fmt.int(x.likes)} · ${fmt.int(x.comments)}` })),
        h("div", { class: "k" }, h("span", { text: "Salvos · compart." }), h("b", { text: `${fmt.int(x.insights?.saved ?? null)} · ${fmt.int(x.insights?.shares ?? null)}` })),
        h("div", { class: "k" }, h("span", { text: "Engajamento" }), h("b", { text: ok(x.rate) ? fmt.pct(x.rate) : "—" })),
      ))));
    const top = medias.filter((x) => x.reach > 0).sort((a, b) => b.reach - a.reach).slice(0, 5);
    const topList = top.length ? h("div", { class: "card" }, h("h3", { text: "Publicações com maior alcance" }), h("div", { class: "list" }, ...top.map((x, i) => h("div", { class: "list-item" }, h("span", { class: "rank good", text: i + 1 }), x.thumbnail ? h("img", { class: "thumb", src: x.thumbnail, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null, h("div", { class: "txt" }, h("div", { class: "n" }, h("a", { href: x.permalink, target: "_blank", rel: "noopener noreferrer", text: x.caption ? x.caption.slice(0, 80) : (x.product_type || "publicação") })), h("div", { class: "s", text: `${fmt.date((x.timestamp || "").slice(0, 10))} · alcance ${fmt.int(x.reach)} · ${fmt.int(x.inter)} interações · ${ok(x.rate) ? fmt.pct(x.rate) : "—"} engaj.` })))))) : null;

    sec.append(block("Instagram", `@${ig.username}`, h("div", { class: "card profile" }, ig.profile_picture_url ? h("img", { src: ig.profile_picture_url, alt: "", referrerpolicy: "no-referrer" }) : null, h("div", {}, h("div", { class: "n", text: ig.name || ig.username }), h("div", { class: "s", text: ig.biography || "" }))), tiles, charts, topList, block("Publicações recentes", "métricas por publicação (Instagram Insights)", medias.length ? grid : h("div", { class: "empty", text: "Sem publicações coletadas." }))));
  } else {
    sec.append(block("Instagram", "", h("div", { class: "placeholder" }, h("b", { text: "Instagram indisponível" }), h("span", { text: "Verifique as permissões instagram_basic e instagram_manage_insights do token e se o perfil está vinculado à página." }))));
  }

  if (fb) {
    const d = fb.daily || {};
    const imp30 = seriesLast(d.page_impressions_unique, 30), eng30 = seriesLast(d.page_post_engagements, 30), fol30 = seriesLast(d.page_daily_follows_total, 30), views30 = seriesLast(d.page_views_total, 30);
    const tiles = h("div", { class: "grid c4" },
      tile({ label: "Seguidores da página", value: fmt.int(fb.followers ?? fb.fans), sub: `${fmt.int(fb.fans)} curtidas` }),
      tile({ label: "Visualizadores únicos (30d)", value: imp30.length ? fmt.int(sum(imp30, (p) => p.value)) : "—", sub: "soma diária · substituiu o alcance" }),
      tile({ label: "Engajamentos (30d)", value: eng30.length ? fmt.int(sum(eng30, (p) => p.value)) : "—", sub: `${views30.length ? fmt.int(sum(views30, (p) => p.value)) : "—"} visitas à página` }),
      tile({ label: "Novos seguidores (30d)", value: fol30.length ? "+" + fmt.int(sum(fol30, (p) => p.value)) : "—", sub: "" }),
    );
    const charts = h("div", { class: "grid c2" });
    if (imp30.length) charts.append(chartCard("Visualizadores únicos por dia · Facebook", "últimos 30 dias", [{ name: "Visualizadores", color: "#3987e5", values: imp30.map((p) => p.value) }], { labels: imp30.map((p) => fmt.dm(p.date)), type: "bar" }));
    if (eng30.length) charts.append(chartCard("Engajamentos por dia · Facebook", "últimos 30 dias", [{ name: "Engajamentos", color: "#199e70", values: eng30.map((p) => p.value) }], { labels: eng30.map((p) => fmt.dm(p.date)), type: "bar" }));
    const posts = (fb.posts || []).slice(0, 10);
    const list = posts.length ? h("div", { class: "card" }, h("h3", { text: "Publicações recentes da página" }), h("div", { class: "list" }, ...posts.map((p) => h("div", { class: "list-item" }, p.picture ? h("img", { class: "thumb", src: p.picture, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null, h("div", { class: "txt" }, h("div", { class: "n" }, h("a", { href: p.permalink, target: "_blank", rel: "noopener noreferrer", text: p.message ? p.message.slice(0, 90) : "publicação" })), h("div", { class: "s", text: `${fmt.date((p.created_time || "").slice(0, 10))} · ${fmt.int(p.likes)} curtidas · ${fmt.int(p.comments)} comentários · ${fmt.int(p.shares)} compart.` })))))) : null;
    sec.append(block("Facebook", fb.name || "", tiles, charts, list));
  }
}


/* ============================================================ seção: app */
const APP_EVENTOS = {
  mobile_app_install: "Instalações do app",
  "app_custom_event.fb_mobile_activate_app": "Aberturas do app",
  "app_custom_event.fb_mobile_complete_registration": "Cadastros no app",
  "app_custom_event.fb_mobile_content_view": "Visualizações de conteúdo",
  "app_custom_event.fb_mobile_add_to_wishlist": "Adições aos favoritos",
  "app_custom_event.fb_mobile_add_to_cart": "Adições ao carrinho",
  "app_custom_event.fb_mobile_initiated_checkout": "Checkouts iniciados",
  "app_custom_event.fb_mobile_purchase": "Compras no app",
  "app_custom_event.fb_mobile_search": "Buscas no app",
  "app_custom_event.fb_mobile_rate": "Avaliações",
  "app_custom_event.fb_mobile_tutorial_completion": "Tutoriais concluídos",
  "app_custom_event.fb_mobile_add_payment_info": "Dados de pagamento",
  "app_custom_event.fb_mobile_achievement_unlocked": "Conquistas",
  "app_custom_event.fb_mobile_level_achieved": "Níveis alcançados",
  "app_custom_event.fb_mobile_spent_credits": "Créditos gastos",
  "app_custom_event.fb_mobile_d2_retention": "Retenção · dia 2",
  "app_custom_event.fb_mobile_d7_retention": "Retenção · dia 7",
  "app_custom_event.other": "Outros eventos do app",
};
const eventoApp = (k) => APP_EVENTOS[k] || `Evento: ${k.replace(/^app_custom_event\./, "").replace(/^fb_mobile_/, "").replace(/_/g, " ")}`;

function renderApp() {
  const sec = $("#sec-app"); if (!sec) return; sec.replaceChildren();
  const m = state.meta; const T = state.targets; const b = state.brand;
  const appCamps = m.campaigns.filter((c) => isApp(c.id));
  if (!appCamps.length) {
    sec.append(block("App", "", h("div", { class: "placeholder" }, h("b", { text: "Nenhuma campanha de promoção do app nesta conta" }), h("span", { text: "A seção mostra as campanhas com objetivo Promoção do app (resultado = instalação)." }))));
    return;
  }
  const rows = rowsIn(state.since, state.until).filter((r) => isApp(r.campaign_id));
  const prevRows = rowsIn(state.prevSince, state.prevUntil).filter((r) => isApp(r.campaign_id));
  const a = aggregate(rows), p = aggregate(prevRows);
  const instDef = resolveResultDef(GOAL_RESULT.APP_INSTALLS, m);
  const asInst = assess(a, instDef);
  const taxa = div(a.app_registrations * 100, a.installs), taxaPrev = div(p.app_registrations * 100, p.installs);
  const loja = (m.adsets.find((s) => isApp(s.campaign_id) && s.promoted_app?.object_store_url) || {}).promoted_app;
  const nivelReg = !ok(a.cost_per_app_registration) || !ok(T.cost_per_app_registration) ? null
    : a.cost_per_app_registration <= T.cost_per_app_registration ? "ok" : a.cost_per_app_registration <= T.cost_per_app_registration * 1.6 ? "warn" : "crit";

  const tiles = h("div", { class: "grid c4" },
    tile({ label: "Investimento em app", value: fmt.brl(a.spend), delta: deltaBadge(a.spend, p.spend, { goodWhenUp: false, kind: "brl" }), accent: true, sub: `${appCamps.filter((c) => c.effective_status === "ACTIVE").length} campanha(s) de app ativa(s)` }),
    tile({ label: "Instalações", value: fmt.int(a.installs), delta: deltaBadge(a.installs, p.installs), accent: true,
      sub: h("span", {}, ok(a.cost_per_install) ? `${fmt.brl(a.cost_per_install)} por instalação` : "nenhuma instalação atribuída", ok(T.cost_per_install) ? ` · meta ${fmt.brl(T.cost_per_install)} ` : " · sem meta ", ok(T.cost_per_install) && ok(a.cost_per_install) ? badge(asInst.level, nivelTxt(asInst.level)) : null) }),
    tile({ label: "Cadastros no app", value: fmt.int(a.app_registrations), delta: deltaBadge(a.app_registrations, p.app_registrations), accent: true,
      sub: h("span", {}, ok(a.cost_per_app_registration) ? `${fmt.brl(a.cost_per_app_registration)} por cadastro` : "nenhum cadastro atribuído", ok(T.cost_per_app_registration) ? ` · meta ${fmt.brl(T.cost_per_app_registration)} ` : " · sem meta ", nivelReg ? badge(nivelReg, nivelTxt(nivelReg)) : null) }),
    tile({ label: "Instalação → cadastro", value: ok(taxa) ? fmt.pct(taxa) : "—", delta: ok(taxa) && ok(taxaPrev) ? deltaBadge(taxa, taxaPrev, { kind: "pct" }) : null, sub: "quantos instaladores criaram conta" }),
    tile({ label: "Cliques para a loja", value: fmt.int(a.link_clicks), delta: deltaBadge(a.link_clicks, p.link_clicks), sub: `CTR ${fmt.pct(a.link_ctr)} · CPC ${fmt.brl(a.link_cpc)}` }),
    tile({ label: "Clique → instalação", value: ok(div(a.installs * 100, a.link_clicks)) ? fmt.pct(div(a.installs * 100, a.link_clicks)) : "—", sub: "de quem clicou, quantos instalaram" }),
    tile({ label: "Impressões", value: fmt.int(a.impressions), delta: deltaBadge(a.impressions, p.impressions), sub: `CPM ${fmt.brl(a.cpm)}` }),
    tile({ label: "Alcance (soma diária)", value: fmt.int(a.reach), sub: `frequência ${fmt.dec(a.frequency)}` }),
  );

  // funil: mesma régua visual do funil da loja
  const etapas = [["Impressões", a.impressions], ["Cliques para a loja", a.link_clicks], ["Instalações", a.installs], ["Cadastros no app", a.app_registrations]];
  const funil = h("div", { class: "card" }, h("div", { class: "funil" }, ...etapas.map(([nome, v], i) => {
    const ant = i > 0 ? etapas[i - 1][1] : null;
    const pct = ant ? (v / ant) * 100 : null;
    const custo = div(a.spend, v);
    return h("div", { class: "funil-row" },
      h("span", { class: "funil-n", text: nome }),
      progressBar(i === 0 ? 100 : (pct || 0), i >= 2 ? "good" : ""),
      h("b", { text: fmt.int(v) }),
      h("span", { class: "faint", text: ok(pct) ? `${fmt.dec1(pct)}% da etapa anterior` : "topo do funil" }),
      h("span", { class: "faint", text: ok(custo) && v > 0 && i > 0 ? `${fmt.brl(custo)} cada` : "" }));
  })), h("div", { class: "faint funil-nota", text: "A barra mostra a conversão em relação à etapa anterior. Instalação e cadastro são os eventos que o SDK do app envia para a Meta e que ela atribui aos anúncios." }));

  const days = []; for (let d = state.since; d <= state.until; d = addDays(d, 1)) days.push(d);
  const labels = days.map(fmt.dm);
  const byDay = groupBy(rows, "date");
  const charts = h("div", { class: "grid c2" },
    chartCard("Instalações e cadastros por dia", "campanhas de app", [
      { name: "Instalações", color: "#199e70", values: days.map((d) => byDay.get(d)?.installs || 0) },
      { name: "Cadastros no app", color: "#c98500", values: days.map((d) => byDay.get(d)?.app_registrations || 0) },
    ], { labels, type: "bar", stacked: false }),
    chartCard("Custo por instalação, por dia", "dias sem instalação ficam vazios", [{ name: "Custo/instalação", color: "#199e70", values: days.map((d) => byDay.get(d)?.cost_per_install ?? null) }], { labels, type: "line", format: fmt.brl, target: T.cost_per_install }),
  );

  // eventos do app (tudo que o SDK mandou e a Meta atribuiu às campanhas de app)
  const tipos = Array.from(new Set([...Object.keys(a.actions), ...Object.keys(p.actions)]))
    .filter((k) => k === "mobile_app_install" || k.startsWith("app_custom_event."))
    .sort((x, y) => (a.actions[y] || 0) - (a.actions[x] || 0));
  const eventos = tipos.length ? h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { class: "l", text: "Evento" }), h("th", { text: "Quantidade" }), h("th", { text: "Custo por evento" }), h("th", { text: "Por instalação" }), h("th", { text: "vs. anterior" }))),
    h("tbody", {}, ...tipos.map((k) => {
      const v = a.actions[k] || 0, pv = p.actions[k] || 0;
      return h("tr", {},
        h("td", { class: "name" }, h("div", { class: "n", text: eventoApp(k) }), h("div", { class: "s", text: k })),
        h("td", {}, h("b", { text: fmt.int(v) })),
        h("td", { text: fmt.brl(div(a.spend, v)) }),
        h("td", { text: k === "mobile_app_install" ? "—" : fmt.dec(div(v, a.installs)) }),
        h("td", {}, deltaBadge(v, pv)));
    })))) : h("div", { class: "empty", text: "Nenhum evento do app atribuído no período." });

  // públicos (conjuntos) das campanhas de app — mesma tabela da seção Meta Ads
  const byAdset = groupBy(rows, "adset_id"), prevByAdset = groupBy(prevRows, "adset_id");
  const sets = m.adsets.filter((s2) => isApp(s2.campaign_id))
    .map((s2) => ({ c: s2, agg: byAdset.get(s2.id) || finish(emptyAgg()), prev: prevByAdset.get(s2.id), def: instDef, parent: idx.campaigns.get(s2.campaign_id) }))
    .filter((y) => y.agg.spend > 0 || y.c.effective_status === "ACTIVE").sort((x, y) => y.agg.spend - x.agg.spend);
  const conjuntos = sets.length ? h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Status" }), h("th", { class: "l", text: "Conjunto" }), h("th", { text: "Orçam./dia" }), h("th", { text: "Instal." }), h("th", { text: "Custo/instal." }), h("th", { text: "Impress." }), h("th", { text: "Alcance" }), h("th", { text: "CPM" }), h("th", { text: "CTR" }), h("th", { text: "Cliques" }), h("th", { text: "CPC" }), h("th", { text: "Gasto" }), h("th", { class: "l", text: "Ação" }))),
    h("tbody", {}, ...sets.map((y) => campaignRow(y, true))))) : h("div", { class: "empty", text: "Sem conjuntos de app com dados no período." });

  // aparelho (últimos 30 dias, só campanhas de app)
  const devs = new Map();
  for (const r of (m.breakdowns?.device || []).filter((r) => isApp(r.campaign_id))) {
    const k = r.impression_device || "?"; if (!devs.has(k)) devs.set(k, emptyAgg()); addRow(devs.get(k), r);
  }
  const APARELHO = { iphone: "iPhone", ipad: "iPad", android_smartphone: "Android", android_tablet: "Tablet Android", desktop: "Computador", other: "Outro" };
  const devList = Array.from(devs.entries()).map(([k, x]) => [k, finish(x)]).sort((x, y) => y[1].spend - x[1].spend);
  const aparelhos = devList.length ? h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Aparelho" }), h("th", { text: "Gasto" }), h("th", { text: "Impressões" }), h("th", { text: "Cliques" }), h("th", { text: "Instalações" }), h("th", { text: "Custo/instalação" }), h("th", { text: "Cadastros" }))),
    h("tbody", {}, ...devList.map(([k, x]) => h("tr", {}, h("td", { text: APARELHO[k] || k }), h("td", { text: fmt.brl(x.spend) }), h("td", { text: fmt.int(x.impressions) }), h("td", { text: fmt.int(x.link_clicks) }), h("td", { text: fmt.int(x.installs) }), h("td", { text: fmt.brl(x.cost_per_install) }), h("td", { text: fmt.int(x.app_registrations) })))))) : null;

  sec.append(...[
    block("App", `${b.app?.name || b.name}${b.app?.platform ? " · " + b.app.platform : ""} · campanhas de promoção do app · ${fmt.date(state.since)} a ${fmt.date(state.until)}`,
      tiles, loja ? h("div", { class: "faint" }, "Página na loja: ", h("a", { href: loja.object_store_url, target: "_blank", rel: "noopener noreferrer", text: loja.object_store_url })) : null),
    block("Funil do app", "da impressão ao cadastro", funil),
    block("Como está evoluindo", "dia a dia do período selecionado", charts),
    block("Eventos do app", "tudo o que o SDK enviou e a Meta atribuiu às campanhas de app no período", eventos),
    block("Públicos", "conjuntos de anúncios das campanhas de app", conjuntos),
    aparelhos ? block("Aparelho", "últimos 30 dias · onde o anúncio de app foi exibido", aparelhos) : null,
  ].filter(Boolean));
}

/* ========================================================= seção: google */
const gCompras = (r) => r.purchases ?? r.conversions ?? 0;
function gAgg(rows) {
  const a = { cost: 0, impressions: 0, clicks: 0, conversions: 0, value: 0, all: 0 };
  for (const r of rows) {
    a.cost += r.cost || 0; a.impressions += r.impressions || 0; a.clicks += r.clicks || 0;
    // `conversions` é a soma das ações principais: em outubro incluía o lead de WhatsApp.
    // As coletas novas separam compra (categoria PURCHASE) do resto; as antigas caem no total.
    const compras = gCompras(r);
    a.conversions += compras; a.value += r.purchases_value ?? r.conversions_value ?? 0;
    a.all += compras + (r.other_conversions ?? Math.max(0, (r.all_conversions ?? 0) - (r.conversions ?? 0)));
  }
  a.roas = div(a.value, a.cost);
  a.ctr = div(a.clicks, a.impressions) != null ? (a.clicks / a.impressions) * 100 : null;
  a.cpc = div(a.cost, a.clicks);
  a.cpa = div(a.cost, a.conversions);
  a.cpm = div(a.cost, a.impressions) != null ? (a.cost / a.impressions) * 1000 : null;
  return a;
}

function renderGoogle() {
  const sec = $("#sec-google"); sec.replaceChildren();
  const cfg = state.config.google_ads || {};
  const g = state.google;

  if (!g) {
    sec.append(block("Google Ads", cfg.account_name ? `${cfg.account_name} · ${cfg.customer_id}` : "",
      h("div", { class: "placeholder" },
        h("b", { text: cfg.enabled ? "Conta criada, coleta ainda não configurada" : "Google Ads desligado na configuração" }),
        h("span", { text: cfg.note || "" }),
        h("span", { class: "faint", text: `Verba prevista: ${fmt.brl(cfg.monthly_budget)}/mês. Diferente do Meta, o Google Ads precisa de quatro segredos (developer token, client id, client secret e refresh token) além do id da conta. O passo a passo está no DASHBOARD.md, seção 5.` }))));
    return;
  }

  const rows = (g.daily || []).filter((r) => r.date >= state.since && r.date <= state.until);
  const prev = (g.daily || []).filter((r) => r.date >= state.prevSince && r.date <= state.prevUntil);
  const a = gAgg(rows), p = gAgg(prev);
  const T = state.targets;

  if (g.warnings?.length) sec.append(h("div", { class: "banner" }, h("b", { text: "Avisos da coleta do Google: " }), h("ul", {}, ...g.warnings.slice(0, 6).map((w) => h("li", { text: w })))));

  sec.append(block("Google Ads", `${g.account?.name || cfg.account_name || ""} · ${cfg.customer_id} · ${fmt.date(state.since)} a ${fmt.date(state.until)}`,
    h("div", { class: "grid c6" },
      tile({ label: "Investimento", value: fmt.brl(a.cost), delta: deltaBadge(a.cost, p.cost, { goodWhenUp: false, kind: "brl" }), accent: true }),
      // as conversões principais da conta são as compras da Nuvemshop (site e backend)
      tile({ label: "Compras", value: fmt.conv(a.conversions), delta: deltaBadge(a.conversions, p.conversions), accent: true,
        sub: a.all > a.conversions ? `+${fmt.conv(a.all - a.conversions)} contatos (clique no WhatsApp)` : "compras registradas pela tag da Nuvemshop" }),
      tile({ label: "Custo por compra", value: fmt.brl(a.cpa), sub: ok(T.cost_per_purchase) ? `meta ${fmt.brl(T.cost_per_purchase)}` : "sem meta definida" }),
      tile({ label: "Receita", value: fmt.brl(a.value), delta: deltaBadge(a.value, p.value, { kind: "brl" }), accent: true, sub: a.conversions > 0 && !(a.value > 0) ? "compra registrada sem valor — conferir a tag de conversão" : ok(div(a.value, a.conversions)) ? `ticket médio ${fmt.brl(div(a.value, a.conversions))}` : "valor das compras atribuídas ao Google" }),
      tile({ label: "ROAS", value: a.value > 0 ? fmt.dec(a.roas) : "—", sub: ok(T.roas_min) ? `mínimo ${fmt.dec(T.roas_min)}` : "receita ÷ investimento" }),
      tile({ label: "Cliques", value: fmt.int(a.clicks), sub: `CTR ${fmt.pct(a.ctr)} · CPC ${fmt.brl(a.cpc)} · ${fmt.compact(a.impressions)} impr.` }),
    )));

  const days = []; for (let d = state.since; d <= state.until; d = addDays(d, 1)) days.push(d);
  const porDia = new Map();
  for (const r of rows) { const x = porDia.get(r.date) || { cost: 0, clicks: 0, conversions: 0, value: 0 }; x.cost += r.cost || 0; x.clicks += r.clicks || 0; x.conversions += gCompras(r); x.value += r.purchases_value ?? r.conversions_value ?? 0; porDia.set(r.date, x); }
  const labels = days.map(fmt.dm);
  sec.append(h("div", { class: "grid c3" },
    chartCard("Receita × investimento", "por dia · Google Ads", [
      { name: "Investimento", color: "#d9a441", values: days.map((d) => porDia.get(d)?.cost || 0) },
      { name: "Receita", color: "#199e70", values: days.map((d) => porDia.get(d)?.value || 0) },
    ], { labels, type: "bar", stacked: false, format: fmt.brl }),
    chartCard("Cliques por dia", "todas as redes (pesquisa, display, YouTube)", [{ name: "Cliques", color: "#3987e5", values: days.map((d) => porDia.get(d)?.clicks || 0) }], { labels, type: "bar" }),
    chartCard("Compras por dia", "conversões principais registradas pela tag", [{ name: "Compras", color: "#199e70", values: days.map((d) => porDia.get(d)?.conversions || 0) }], { labels, type: "bar", format: fmt.conv }),
  ));

  const REDE = { SEARCH: "Pesquisa Google", SEARCH_PARTNERS: "Parceiros de pesquisa", CONTENT: "Display (sites e apps)", YOUTUBE: "YouTube", YOUTUBE_SEARCH: "YouTube", YOUTUBE_WATCH: "YouTube", DISCOVER: "Discover e Gmail", MIXED: "Misto (PMax)", GOOGLE_TV: "Google TV", MAPS: "Maps" };
  const APARELHO_G = { MOBILE: "Celular", DESKTOP: "Computador", TABLET: "Tablet", CONNECTED_TV: "TV", OTHER: "Outro" };
  const recorte = (lista, nomes) => {
    const m = new Map();
    for (const r of (lista || []).filter((x) => x.date >= state.since && x.date <= state.until)) {
      const k = nomes[r.key] || r.key; const x = m.get(k) || []; x.push(r); m.set(k, x);
    }
    return Array.from(m.entries()).map(([k, rs]) => [k, gAgg(rs)]).filter(([, x]) => x.cost > 0 || x.clicks > 0).sort((x, y) => y[1].cost - x[1].cost);
  };
  const tabelaRecorte = (titulo, rotulo, lista) => h("div", { class: "table-wrap" }, h("div", { class: "group-head" }, h("span", { text: titulo }), h("small", { text: "no período selecionado" })),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: rotulo }), h("th", { text: "Investimento" }), h("th", { text: "% da verba" }), h("th", { text: "Cliques" }), h("th", { text: "CPC" }), h("th", { text: "Compras" }), h("th", { text: "Receita" }))),
      h("tbody", {}, ...lista.map(([k, x]) => h("tr", {}, h("td", { text: k }), h("td", { text: fmt.brl(x.cost) }), h("td", { text: a.cost ? `${fmt.dec1((x.cost / a.cost) * 100)}%` : "—" }),
        h("td", { text: fmt.int(x.clicks) }), h("td", { text: fmt.brl(x.cpc) }), h("td", { text: fmt.conv(x.conversions) }), h("td", { text: fmt.brl(x.value) }))))));
  const porRede = recorte(g.by_network, REDE), porAparelho = recorte(g.by_device, APARELHO_G);
  if (porRede.length || porAparelho.length) {
    const display = porRede.find(([k]) => k === REDE.CONTENT);
    const fatia = display && a.cost ? display[1].cost / a.cost : 0;
    const aviso = fatia >= 0.6 && display[1].conversions < 1
      ? h("div", { class: "alerts" }, h("div", { class: "alert warn" },
          h("div", { class: "t" }, badge("warn", "atenção"), `${fmt.dec1(fatia * 100)}% da verba do Google foi para Display, sem nenhuma compra`),
          h("div", { class: "d", text: "A Performance Max sem histórico de vendas compra o inventário mais barato, que é o Display (muito clique em app no celular). Até as compras começarem a entrar, vale reforçar a Pesquisa com termos de quem já procura o produto." })))
      : null;
    sec.append(block("Onde o Google entrega", "a Performance Max escolhe sozinha entre pesquisa, display, YouTube e Discover", aviso,
      h("div", { class: "grid c2" }, porRede.length ? tabelaRecorte("Rede", "Rede", porRede) : null, porAparelho.length ? tabelaRecorte("Aparelho", "Aparelho", porAparelho) : null)));
  }

  const nomeCamp = new Map((g.campaigns || []).map((c) => [String(c.id), c.name]));
  const porCamp = new Map();
  for (const r of rows) { const k = String(r.campaign_id); const l = porCamp.get(k) || []; l.push(r); porCamp.set(k, l); }
  const camp = Array.from(porCamp.entries()).map(([id, rs]) => ({ id, name: nomeCamp.get(id) || id, agg: gAgg(rs) })).sort((x, y) => y.agg.cost - x.agg.cost);
  if (camp.length) {
    sec.append(block("Campanhas", "no período selecionado", h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Campanha" }), h("th", { text: "Investimento" }), h("th", { text: "Impressões" }), h("th", { text: "Cliques" }), h("th", { text: "CTR" }), h("th", { text: "CPC" }), h("th", { text: "Compras" }), h("th", { text: "Custo/compra" }), h("th", { text: "Receita" }), h("th", { text: "ROAS" }))),
      h("tbody", {}, ...camp.map((c) => h("tr", {},
        h("td", { text: c.name }), h("td", { text: fmt.brl(c.agg.cost) }), h("td", { text: fmt.int(c.agg.impressions) }),
        h("td", { text: fmt.int(c.agg.clicks) }), h("td", { text: fmt.pct(c.agg.ctr) }), h("td", { text: fmt.brl(c.agg.cpc) }),
        h("td", {}, fmt.conv(c.agg.conversions), c.agg.all > c.agg.conversions ? h("span", { class: "faint", text: ` +${fmt.conv(c.agg.all - c.agg.conversions)} sec.` }) : null),
        h("td", { text: fmt.brl(c.agg.cpa) }), h("td", { text: fmt.brl(c.agg.value) }), h("td", { text: c.agg.value > 0 ? fmt.dec(c.agg.roas) : "—" }))))))));
  }

  const kws = (g.keywords || []).slice().sort((x, y) => (y.cost || 0) - (x.cost || 0)).slice(0, 25);
  if (kws.length) {
    sec.append(block("Palavras-chave", "25 que mais consumiram verba", h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Palavra" }), h("th", { text: "Correspondência" }), h("th", { text: "Grupo" }), h("th", { text: "Investimento" }), h("th", { text: "Cliques" }), h("th", { text: "CPC" }), h("th", { text: "Conversões" }))),
      h("tbody", {}, ...kws.map((k) => h("tr", {},
        h("td", { text: k.text }), h("td", { text: k.match_type || "—" }), h("td", { text: k.ad_group || "—" }),
        h("td", { text: fmt.brl(k.cost) }), h("td", { text: fmt.int(k.clicks) }), h("td", { text: fmt.brl(k.avg_cpc) }),
        h("td", { text: fmt.int(k.conversions) }))))))));
  }

  const termos = (g.search_terms || []).slice().sort((x, y) => (y.cost || 0) - (x.cost || 0)).slice(0, 25);
  if (termos.length) {
    sec.append(block("Termos de pesquisa", "o que a pessoa digitou de verdade — é daqui que saem as negativas", h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Termo" }), h("th", { text: "Investimento" }), h("th", { text: "Impressões" }), h("th", { text: "Cliques" }), h("th", { text: "Conversões" }))),
      h("tbody", {}, ...termos.map((t) => h("tr", {},
        h("td", { text: t.term }), h("td", { text: fmt.brl(t.cost) }), h("td", { text: fmt.int(t.impressions) }),
        h("td", { text: fmt.int(t.clicks) }), h("td", { text: fmt.int(t.conversions) }))))))));
  }

  /* --- o que os anúncios dizem ------------------------------------------- */
  // O cliente pergunta "o que estamos escrevendo no Google?". Antes a resposta
  // só existia dentro do painel do Google, que ele não abre.
  const anuncios = (g.ads || []).filter((a) => (a.headlines || []).length || (a.descriptions || []).length);
  if (anuncios.length) {
    // agrupado por campanha: é assim que ele pensa a conta
    const porCampanha = new Map();
    for (const a of anuncios) {
      const k = a.campaign || "(sem nome)";
      if (!porCampanha.has(k)) porCampanha.set(k, []);
      porCampanha.get(k).push(a);
    }
    const blocos = Array.from(porCampanha.entries()).map(([campanha, lista]) =>
      h("div", { class: "card" },
        h("h3", {}, campanha),
        ...lista.map((a) => {
          // No Google o anúncio só entrega se campanha, grupo E anúncio
          // estiverem ativos. Olhar só o status do anúncio mostrava "ativo"
          // para anúncio dentro de campanha pausada — que não roda.
          const nivel = (v) => (v || "").toUpperCase();
          const bloqueio =
            nivel(a.campaign_status) && nivel(a.campaign_status) !== "ENABLED" ? "campanha" :
            nivel(a.ad_group_status) && nivel(a.ad_group_status) !== "ENABLED" ? "grupo" :
            nivel(a.status) !== "ENABLED" ? "anúncio" : null;
          const ativo = !bloqueio;
          // campanha é feminino; grupo e anúncio, masculinos
          const palavra = (v, f) => {
            const mapa = { PAUSED: "pausad", REMOVED: "removid", DISABLED: "desativad" }[nivel(v)];
            if (mapa) return mapa + (f ? "a" : "o");
            return nivel(v) ? nivel(v).toLowerCase() : "sem status";
          };
          const rotuloStatus = ativo ? "no ar"
            : bloqueio === "campanha" ? `campanha ${palavra(a.campaign_status, true)}`
            : bloqueio === "grupo" ? `grupo ${palavra(a.ad_group_status, false)}`
            : `anúncio ${palavra(a.status, false)}`;
          return h("div", { class: "ad-copy" },
            h("div", { class: "ad-copy-head" },
              h("span", { class: "muted", text: a.ad_group || "" }),
              badge(ativo ? "ok" : "neutral", rotuloStatus),
            ),
            h("div", { class: "ad-copy-cols" },
              h("div", {},
                h("div", { class: "ad-copy-rot", text: `Títulos (${(a.headlines || []).length})` }),
                h("ul", { class: "ad-copy-lista" },
                  ...(a.headlines || []).map((x) => h("li", {},
                    h("span", { text: x }),
                    h("span", { class: "ad-copy-n", text: String(x.length) }))))),
              h("div", {},
                h("div", { class: "ad-copy-rot", text: `Descrições (${(a.descriptions || []).length})` }),
                h("ul", { class: "ad-copy-lista" },
                  ...(a.descriptions || []).map((x) => h("li", {},
                    h("span", { text: x }),
                    h("span", { class: "ad-copy-n", text: String(x.length) }))))),
            ),
            a.final_url ? h("div", { class: "ad-copy-url" },
              h("span", { class: "muted", text: "destino " }),
              h("a", { href: a.final_url, target: "_blank", rel: "noopener", text: a.final_url }),
              a.path ? h("span", { class: "muted", text: ` · aparece como .../${a.path}` }) : null) : null,
          );
        })));
    sec.append(block("O que os anúncios dizem",
      "títulos e descrições no ar em cada campanha · o número ao lado é a contagem de caracteres (limite: 30 no título, 90 na descrição)",
      h("div", { class: "grid c1" }, ...blocos)));
  }
}

/* ============================================ seção: comportamento no site */
/* Microsoft Clarity. A API só devolve os últimos 3 dias; o coletor guarda um retrato
   por dia e o painel junta os retratos do período. Contagens somam; médias e
   porcentagens são ponderadas pelas sessões de cada retrato. */
const FRUSTRACAO = [
  ["RageClickCount", "Cliques de raiva", "clicou várias vezes seguidas no mesmo lugar — botão que não responde"],
  ["DeadClickCount", "Cliques mortos", "clicou em algo que não faz nada"],
  ["QuickbackClick", "Voltas rápidas", "abriu uma página e voltou logo — não era o que esperava"],
  ["ExcessiveScroll", "Rolagem excessiva", "rolou para cima e para baixo procurando algo"],
  ["ScriptErrorCount", "Erros de JavaScript", "a página deu erro no navegador"],
  ["ErrorClickCount", "Cliques com erro", "o clique disparou um erro"],
];
// os nomes de campo da API variam de caixa; lê sem diferenciar
function cv(row, ...names) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const n of names) { const k = keys.find((x) => x.toLowerCase() === n.toLowerCase()); if (k != null && row[k] != null && row[k] !== "") return row[k]; }
  return null;
}
const cnum = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
function fmtTempo(seg) {
  if (!ok(seg)) return "—";
  const s = Math.round(seg);
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}
function novoAcc() { return { sessions: 0, bots: 0, users: 0, ppsW: 0, scrollW: 0, scrollB: 0, activeW: 0, totalW: 0, timeB: 0, frus: {} }; }
// soma as métricas de um conjunto de linhas (de um dia, de um valor de dimensão) no acumulador
function acumula(acc, m, filtro) {
  const linhas = (nome) => (m[nome] || []).filter(filtro || (() => true));
  let sessDia = 0;
  for (const r of linhas("Traffic")) {
    const s = cnum(cv(r, "totalSessionCount", "sessionsCount"));
    sessDia += s; acc.sessions += s;
    acc.bots += cnum(cv(r, "totalBotSessionCount"));
    acc.users += cnum(cv(r, "distantUserCount", "distinctUserCount", "userCount"));
    acc.ppsW += cnum(cv(r, "PagesPerSessionPercentage", "pagesPerSession")) * s;
  }
  for (const r of linhas("ScrollDepth")) {
    const s = cnum(cv(r, "sessionsCount")) || sessDia;
    acc.scrollW += cnum(cv(r, "averageScrollDepth", "scrollDepth")) * s; acc.scrollB += s;
  }
  for (const r of linhas("EngagementTime")) {
    const s = cnum(cv(r, "sessionsCount")) || sessDia;
    acc.activeW += cnum(cv(r, "activeTime")) * s; acc.totalW += cnum(cv(r, "totalTime")) * s; acc.timeB += s;
  }
  for (const [nome] of FRUSTRACAO) {
    const f = acc.frus[nome] || (acc.frus[nome] = { com: 0, base: 0, vezes: 0 });
    for (const r of linhas(nome)) {
      const s = cnum(cv(r, "sessionsCount")) || sessDia;
      f.com += (cnum(cv(r, "sessionsWithMetricPercentage")) / 100) * s; f.base += s;
      f.vezes += cnum(cv(r, "subTotal"));
    }
  }
  return acc;
}
function fechaAcc(a) {
  a.pps = div(a.ppsW, a.sessions); a.scroll = div(a.scrollW, a.scrollB);
  a.active = div(a.activeW, a.timeB); a.total = div(a.totalW, a.timeB);
  for (const f of Object.values(a.frus)) f.pct = f.base > 0 ? (f.com / f.base) * 100 : null;
  return a;
}
// junta, por valor da dimensão (aparelho, origem, página), os retratos do período
function porDimensao(snaps, dim) {
  const mapa = new Map();
  for (const s of snaps) {
    const m = s.by?.[dim]; if (!m) continue;
    const valores = new Set();
    for (const linhas of Object.values(m)) for (const r of linhas) { const v = cv(r, dim, dim === "URL" ? "Url" : dim); if (v != null) valores.add(String(v)); }
    for (const v of valores) {
      const acc = mapa.get(v) || novoAcc();
      acumula(acc, m, (r) => String(cv(r, dim, dim === "URL" ? "Url" : dim)) === v);
      mapa.set(v, acc);
    }
  }
  return Array.from(mapa.entries()).map(([k, a]) => [k, fechaAcc(a)]).filter(([, a]) => a.sessions > 0 || Object.values(a.frus).some((f) => f.base > 0))
    .sort((x, y) => (y[1].sessions || 0) - (x[1].sessions || 0));
}
function caminhoCurto(url) {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, "").includes("lojavirtualnuvem") ? "loja " : "") + (u.pathname || "/") ; } catch { return String(url).slice(0, 60); }
}
const ehLoja = (url) => /checkout|carrinho|cart|finalizar|pagamento|lojavirtualnuvem/i.test(String(url));

function renderSite() {
  const sec = $("#sec-site"); if (!sec) return; sec.replaceChildren();
  const cfg = state.config.clarity || {};
  const c = state.clarity;
  if (!c || !(c.projects || []).some((p) => (p.snapshots || []).length)) {
    sec.append(block("Comportamento no site", "Microsoft Clarity",
      h("div", { class: "placeholder" },
        h("b", { text: c ? "Clarity conectado, ainda sem nenhum retrato coletado" : "Clarity ainda não coletado" }),
        h("span", { text: "A coleta usa o token da Data Export API guardado no GitHub (secret CLARITY_API_TOKEN). A API só devolve os últimos 3 dias, então o histórico começa no dia da primeira coleta e cresce um dia por vez." }),
        ...(c?.warnings || []).slice(0, 4).map((w) => h("span", { class: "faint", text: w })))));
    return;
  }
  const projetos = c.projects.filter((p) => (p.snapshots || []).length);
  if (!projetos.some((p) => p.id === state.clarityProject)) state.clarityProject = projetos[0].id;
  const proj = projetos.find((p) => p.id === state.clarityProject);
  const snaps = proj.snapshots.filter((s) => s.date >= state.since && s.date <= state.until);
  const todos = proj.snapshots;

  if (c.warnings?.length) sec.append(h("div", { class: "banner" }, h("b", { text: "Avisos da coleta do Clarity: " }), h("ul", {}, ...c.warnings.slice(0, 5).map((w) => h("li", { text: w })))));
  const seletor = projetos.length > 1 ? h("div", { class: "filter-row" }, h("span", { text: "Projeto" }),
    ...projetos.map((p) => h("button", { type: "button", class: `chip${p.id === proj.id ? " on" : ""}`, text: p.name, onclick: () => { state.clarityProject = p.id; renderSite(); } }))) : null;
  const nota = `${todos.length} dia${todos.length === 1 ? "" : "s"} de histórico, desde ${fmt.date(todos[0].date)} · cada retrato cobre as 24 h antes da coleta diária`;

  if (!snaps.length) {
    sec.append(block("Comportamento no site", `${proj.name} · Microsoft Clarity`, seletor,
      h("div", { class: "placeholder" }, h("b", { text: "Nenhum retrato do Clarity dentro do período escolhido" }), h("span", { text: nota }))));
    return;
  }

  const tot = fechaAcc(snaps.reduce((acc, s) => acumula(acc, s.totals || {}), novoAcc()));
  const f = (nome) => tot.frus[nome] || {};
  const nivelFrus = (pct, limite) => (!ok(pct) ? "neutral" : pct >= limite * 2 ? "crit" : pct >= limite ? "warn" : "ok");
  sec.append(block("Comportamento no site", `${proj.name} · Microsoft Clarity · ${fmt.date(snaps[0].date)} a ${fmt.date(snaps[snaps.length - 1].date)}`, seletor,
    h("div", { class: "grid c6" },
      tile({ label: "Sessões", value: fmt.int(tot.sessions), accent: true, sub: `${fmt.int(tot.users)} usuários (soma diária)${tot.bots ? ` · ${fmt.int(tot.bots)} de robôs fora da conta` : ""}` }),
      tile({ label: "Páginas por sessão", value: fmt.dec(tot.pps) }),
      tile({ label: "Tempo ativo médio", value: fmtTempo(tot.active), sub: ok(tot.total) ? `${fmtTempo(tot.total)} com a página aberta` : "" }),
      tile({ label: "Rolagem média", value: ok(tot.scroll) ? `${fmt.dec1(tot.scroll)}%` : "—", sub: "até onde a pessoa desce na página" }),
      tile({ label: "Cliques de raiva", value: fmt.pct(f("RageClickCount").pct), sub: h("span", {}, "das sessões ", badge(nivelFrus(f("RageClickCount").pct, 3), nivelFrus(f("RageClickCount").pct, 3) === "ok" ? "normal" : "atenção")) }),
      tile({ label: "Voltas rápidas", value: fmt.pct(f("QuickbackClick").pct), sub: h("span", {}, "das sessões ", badge(nivelFrus(f("QuickbackClick").pct, 10), nivelFrus(f("QuickbackClick").pct, 10) === "ok" ? "normal" : "atenção")) }),
    ),
    h("div", { class: "faint", text: nota })));

  // atrito: o que trava a pessoa
  sec.append(block("Sinais de atrito", "porcentagem das sessões em que cada comportamento apareceu ao menos uma vez",
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { class: "l", text: "Sinal" }), h("th", { text: "% das sessões" }), h("th", { text: "Ocorrências" }), h("th", { class: "l", text: "O que é" }))),
      h("tbody", {}, ...FRUSTRACAO.map(([nome, rotulo, oque]) => h("tr", {},
        h("td", { class: "l", text: rotulo }), h("td", { text: fmt.pct(f(nome).pct) }), h("td", { text: fmt.int(f(nome).vezes) }), h("td", { class: "l faint", text: oque }))))))));

  // dia a dia
  const dias = []; for (let d = state.since; d <= state.until; d = addDays(d, 1)) dias.push(d);
  const porDia = new Map(snaps.map((s) => [s.date, fechaAcc(acumula(novoAcc(), s.totals || {}))]));
  const labels = dias.map(fmt.dm);
  sec.append(h("div", { class: "grid c2" },
    chartCard("Sessões por dia", "retrato diário do Clarity", [{ name: "Sessões", color: "#3987e5", values: dias.map((d) => porDia.get(d)?.sessions || 0) }], { labels, type: "bar" }),
    chartCard("Atrito por dia", "% das sessões", [
      { name: "Cliques de raiva", color: "#d03b3b", values: dias.map((d) => porDia.get(d)?.frus.RageClickCount?.pct ?? null) },
      { name: "Voltas rápidas", color: "#c98500", values: dias.map((d) => porDia.get(d)?.frus.QuickbackClick?.pct ?? null) },
      { name: "Cliques mortos", color: "#9085e9", values: dias.map((d) => porDia.get(d)?.frus.DeadClickCount?.pct ?? null) },
    ], { labels, type: "line", format: (n) => fmt.pct(n) }),
  ));

  // por página: é aqui que aparece o checkout travando
  const paginas = porDimensao(snaps, "URL").slice(0, 25);
  if (paginas.length) {
    const alerta = (a) => (a.frus.RageClickCount?.pct || 0) >= 6 || (a.frus.DeadClickCount?.pct || 0) >= 15 || (a.frus.QuickbackClick?.pct || 0) >= 20 || (a.frus.ScriptErrorCount?.pct || 0) >= 10;
    sec.append(block("Por página", "as 25 com mais sessões · páginas da loja (carrinho, checkout) marcadas · retratos dos últimos 40 dias",
      h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { class: "l", text: "Página" }), h("th", { text: "Sessões" }), h("th", { text: "Rolagem" }), h("th", { text: "Tempo ativo" }), h("th", { text: "Raiva" }), h("th", { text: "Clique morto" }), h("th", { text: "Volta rápida" }), h("th", { text: "Erro JS" }))),
        h("tbody", {}, ...paginas.map(([url, a]) => h("tr", {},
          h("td", { class: "l" }, ehLoja(url) ? h("span", { class: "tag", text: "loja" }) : null, " ", /^https?:\/\//i.test(url) ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: caminhoCurto(url) }) : caminhoCurto(url), alerta(a) ? h("span", {}, " ", badge("warn", "atrito")) : null),
          h("td", { text: fmt.int(a.sessions) }), h("td", { text: ok(a.scroll) ? `${fmt.dec1(a.scroll)}%` : "—" }), h("td", { text: fmtTempo(a.active) }),
          h("td", { text: fmt.pct(a.frus.RageClickCount?.pct) }), h("td", { text: fmt.pct(a.frus.DeadClickCount?.pct) }),
          h("td", { text: fmt.pct(a.frus.QuickbackClick?.pct) }), h("td", { text: fmt.pct(a.frus.ScriptErrorCount?.pct) }))))))));
  }

  // aparelho e origem
  const tabelaDim = (titulo, rotulo, lista) => h("div", { class: "table-wrap" }, h("div", { class: "group-head" }, h("span", { text: titulo }), h("small", { text: "no período" })),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: rotulo }), h("th", { text: "Sessões" }), h("th", { text: "Pág./sessão" }), h("th", { text: "Rolagem" }), h("th", { text: "Raiva" }), h("th", { text: "Volta rápida" }))),
      h("tbody", {}, ...lista.slice(0, 12).map(([k, a]) => h("tr", {}, h("td", { text: k || "(sem valor)" }), h("td", { text: fmt.int(a.sessions) }), h("td", { text: fmt.dec(a.pps) }),
        h("td", { text: ok(a.scroll) ? `${fmt.dec1(a.scroll)}%` : "—" }), h("td", { text: fmt.pct(a.frus.RageClickCount?.pct) }), h("td", { text: fmt.pct(a.frus.QuickbackClick?.pct) }))))));
  const aparelhos = porDimensao(snaps, "Device"), origens = porDimensao(snaps, "Source");
  if (aparelhos.length || origens.length) sec.append(block("Aparelho e origem", "de onde a pessoa vem e em que aparelho navega",
    h("div", { class: "grid c2" }, aparelhos.length ? tabelaDim("Aparelho", "Aparelho", aparelhos) : null, origens.length ? tabelaDim("Origem (utm_source)", "Origem", origens) : null)));

  // de onde a pessoa veio (o Clarity manda junto com o total, como nome + sessões)
  const refs = new Map();
  for (const sn of snaps) for (const r of sn.totals?.ReferrerUrl || []) { const n = cv(r, "name") || "(direto)"; refs.set(String(n), (refs.get(String(n)) || 0) + cnum(cv(r, "sessionsCount"))); }
  const refsTop = Array.from(refs.entries()).sort((x, y) => y[1] - x[1]).slice(0, 12);
  if (refsTop.length) sec.append(block("Sites de origem", "o endereço de onde a pessoa clicou para chegar (Instagram, Facebook, Google…)", h("div", { class: "card" }, h("div", { class: "split" },
    ...refsTop.map(([n, v]) => h("div", { class: "split-row" }, h("span", { title: n, text: caminhoCurto(n) === "/" ? n.replace(/^https?:\/\//, "") : n.replace(/^https?:\/\//, "").slice(0, 40) }), progressBar((v / refsTop[0][1]) * 100), h("b", { text: fmt.int(v) })))))));

  // páginas mais visitadas (métrica própria do Clarity)
  const visitas = new Map();
  for (const s of snaps) for (const r of s.totals?.PopularPages || []) { const u = cv(r, "url", "URL", "Url"); if (u) visitas.set(String(u), (visitas.get(String(u)) || 0) + cnum(cv(r, "visitsCount", "visits"))); }
  const topo = Array.from(visitas.entries()).sort((x, y) => y[1] - x[1]).slice(0, 15);
  if (topo.length) sec.append(block("Páginas mais visitadas", "visitas no período", h("div", { class: "card" }, h("div", { class: "split" },
    ...topo.map(([u, v]) => h("div", { class: "split-row" }, h("span", { title: u, text: caminhoCurto(u) }), progressBar((v / topo[0][1]) * 100, ehLoja(u) ? "good" : ""), h("b", { text: fmt.int(v) })))))));
}

/* ==================================================== seção: consolidado */
function renderConsolidado() {
  const sec = $("#sec-consolidado"); sec.replaceChildren();
  const vivas = state.brands.filter((b) => b.meta);
  if (!vivas.length) { sec.append(block("Visão consolidada", "", h("div", { class: "placeholder" }, h("b", { text: "Nenhuma conta coletada ainda" })))); return; }

  const porMarca = vivas.map((b) => {
    const rows = rowsIn(state.since, state.until, b.meta.daily);
    const prevRows = rowsIn(state.prevSince, state.prevUntil, b.meta.daily);
    const cap = rows.filter((r) => capIn(b.idx, r.campaign_id));
    return {
      b, rows,
      all: aggregate(rows), prev: aggregate(prevRows),
      cap: aggregate(cap), topo: aggregate(rows.filter((r) => !capIn(b.idx, r.campaign_id))),
    };
  });

  if (vivas.every((b) => modoFrentes(b))) { renderConsolidadoFrentes(sec, vivas, porMarca); return; }

  const gRows = state.google ? (state.google.daily || []).filter((r) => r.date >= state.since && r.date <= state.until) : [];
  const gA = gAgg(gRows);
  const gCost = gA.cost;
  const algumaVenda = porMarca.some((x) => temVendaNa(x.b.meta, x.b.idx));
  const comprasMeta = sum(porMarca, (x) => x.all.purchases), receitaMeta = sum(porMarca, (x) => x.all.revenue);
  const comprasTotal = comprasMeta + gA.conversions, receitaTotal = receitaMeta + gA.value;
  const metaTotal = sum(porMarca, (x) => x.all.spend);
  const prevTotal = sum(porMarca, (x) => x.prev.spend);
  const convTotal = sum(porMarca, (x) => x.cap.conversations || 0);
  const contatoTotal = sum(porMarca, (x) => x.cap.contacts || 0);
  const leadTotal = sum(porMarca, (x) => x.cap.leads || 0);
  const capTotal = sum(porMarca, (x) => x.cap.spend);
  const verbas = vivas.map((b) => b.budget?.meta_monthly).filter((v) => ok(v));
  const verbaTotal = verbas.length === vivas.length ? sum(verbas) : null;

  sec.append(block("Visão consolidada", `as ${vivas.length} contas do Meta${state.google ? " mais o Google Ads" : ""} · ${fmt.date(state.since)} a ${fmt.date(state.until)}`,
    h("div", { class: "grid c6" },
      tile({ label: "Investimento total", value: fmt.brl(metaTotal + gCost), sub: state.google ? `Meta ${fmt.brl(metaTotal)} · Google ${fmt.brl(gCost)}` : "só Meta Ads", delta: deltaBadge(metaTotal, prevTotal, { goodWhenUp: false, kind: "brl" }), accent: true, hero: true }),
      ...(algumaVenda ? [
        tile({ label: "Compras", value: fmt.conv(comprasTotal), accent: true, sub: state.google ? `Meta ${fmt.int(comprasMeta)} · Google ${fmt.conv(gA.conversions)}` : "atribuídas ao Meta" }),
        tile({ label: "Receita", value: fmt.brl(receitaTotal), accent: true, sub: state.google ? `Meta ${fmt.brl(receitaMeta)} · Google ${fmt.brl(gA.value)}` : "atribuída ao Meta" }),
        tile({ label: "ROAS geral", value: receitaTotal > 0 ? fmt.dec(div(receitaTotal, metaTotal + gCost)) : "—", sub: "receita das plataformas ÷ investimento total" }),
        tile({ label: "Contatos e leads", value: fmt.int(contatoTotal + leadTotal), sub: `${fmt.int(contatoTotal)} contatos · ${fmt.int(leadTotal)} leads${convTotal ? ` · ${fmt.int(convTotal)} conversas` : ""}` }),
      ] : [
        tile({ label: "Contatos", value: fmt.int(contatoTotal), sub: convTotal ? `mais ${fmt.int(convTotal)} conversas no WhatsApp` : "somados as duas contas" }),
        tile({ label: "Leads no site", value: fmt.int(leadTotal), sub: ok(div(capTotal, leadTotal)) ? `${fmt.brl(div(capTotal, leadTotal))} por lead` : "nenhum no período" }),
        tile({ label: "Alcance somado", value: fmt.int(sum(porMarca, (x) => x.all.reach)), sub: "soma diária — há sobreposição entre as contas" }),
        tile({ label: "Cliques no link", value: fmt.int(sum(porMarca, (x) => x.all.link_clicks)) }),
      ]),
      tile({ label: "Verba Meta / mês", value: verbaTotal != null ? fmt.brl(verbaTotal) : "—", sub: verbaTotal != null ? "soma das marcas" : "verba de alguma marca não definida" }),
    )));

  // investimento por dia, uma faixa por marca
  const days = []; for (let d = state.since; d <= state.until; d = addDays(d, 1)) days.push(d);
  const labels = days.map(fmt.dm);
  const series = porMarca.map((x) => {
    const byDay = groupBy(x.rows, "date");
    return { name: x.b.name, color: x.b.accent || "var(--meta)", values: days.map((d) => byDay.get(d)?.spend || 0) };
  });
  // captação = contato + lead + conversa de WhatsApp; são caminhos diferentes
  // para a mesma coisa, que é alguém pedindo contato
  const convSeries = porMarca.map((x) => {
    const byDay = groupBy(x.rows.filter((r) => capIn(x.b.idx, r.campaign_id)), "date");
    return { name: x.b.name, color: x.b.accent || "var(--meta)", values: days.map((d) => byDay.get(d)?.captures || 0) };
  });
  // na loja o gráfico da direita vira compras por plataforma (cada marca no Meta + Google)
  const gPorDia = new Map(); for (const r of gRows) gPorDia.set(r.date, (gPorDia.get(r.date) || 0) + gCompras(r));
  const gCustoDia = new Map(); for (const r of gRows) gCustoDia.set(r.date, (gCustoDia.get(r.date) || 0) + (r.cost || 0));
  const comprasSeries = [
    ...porMarca.filter((x) => temVendaNa(x.b.meta, x.b.idx)).map((x) => { const byDay = groupBy(x.rows, "date"); return { name: `${x.b.short || x.b.name} · Meta`, color: x.b.accent || "var(--meta)", values: days.map((d) => byDay.get(d)?.purchases || 0) }; }),
    ...(state.google ? [{ name: "Google Ads", color: "#d95926", values: days.map((d) => gPorDia.get(d) || 0) }] : []),
  ];
  const investSeries = state.google ? [...series, { name: "Google Ads", color: "#d95926", values: days.map((d) => gCustoDia.get(d) || 0) }] : series;
  sec.append(h("div", { class: "grid c2" },
    chartCard(state.google ? "Investimento por dia, por plataforma" : "Investimento por dia, por marca", "empilhado", investSeries, { labels, type: "bar", stacked: true, format: fmt.brl }),
    algumaVenda
      ? chartCard("Compras por dia, por plataforma", "atribuídas por cada plataforma", comprasSeries, { labels, type: "bar", stacked: true, format: fmt.conv })
      : chartCard("Captação por dia, por marca", "contatos, leads no site e conversas somados", convSeries, { labels, type: "bar", stacked: true }),
  ));

  sec.append(block("Lado a lado", "mesma janela para as duas contas", h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Marca" }), h("th", { text: "Conta" }), h("th", { text: "Investimento" }), h("th", { text: "Compras" }), h("th", { text: "Receita" }), h("th", { text: "ROAS" }), h("th", { text: "Checkouts" }), h("th", { text: "Contatos" }), h("th", { text: "Leads" }), h("th", { text: "CPM" }), h("th", { text: "CTR" }))),
    h("tbody", {}, ...porMarca.map((x) => h("tr", {},
      h("td", {}, spanDot(x.b.accent || "#888"), " ", x.b.name),
      h("td", { class: "faint", text: x.b.meta.account?.name || x.b.meta.account?.id }),
      h("td", { text: fmt.brl(x.all.spend) }),
      h("td", { text: fmt.int(x.all.purchases) }), h("td", { text: fmt.brl(x.all.revenue) }), h("td", { text: x.all.revenue > 0 ? fmt.dec(x.all.roas) : "—" }), h("td", { text: fmt.int(x.all.checkouts) }),
      h("td", {}, fmt.int(x.cap.contacts), x.cap.conversations ? h("span", { class: "faint", text: ` +${fmt.int(x.cap.conversations)} conv.` }) : null),
      h("td", { text: fmt.int(x.cap.leads) }),
      h("td", { text: fmt.brl(x.all.cpm) }), h("td", { text: fmt.pct(x.all.ctr) }))),
      state.google ? h("tr", {}, h("td", {}, spanDot("#d95926"), " Google Ads"),
        h("td", { class: "faint", text: state.config.google_ads?.customer_id || "" }),
        h("td", { text: fmt.brl(gCost) }), h("td", { text: fmt.conv(gA.conversions) }), h("td", { text: fmt.brl(gA.value) }), h("td", { text: gA.value > 0 ? fmt.dec(gA.roas) : "—" }),
        h("td", { text: "—" }), h("td", { text: gA.all > gA.conversions ? `${fmt.conv(gA.all - gA.conversions)} (WhatsApp)` : "—" }), h("td", { text: "—" }),
        h("td", { text: fmt.brl(gA.cpm) }), h("td", { text: fmt.pct(gA.ctr) })) : null,
    )))));

  const comOrg = vivas.filter((b) => b.organic?.instagram);
  if (comOrg.length) {
    sec.append(block("Audiência orgânica", "perfis do Instagram das duas marcas", h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Marca" }), h("th", { text: "Perfil" }), h("th", { text: "Seguidores" }), h("th", { text: "Publicações" }), h("th", { text: "Alcance 30d" }), h("th", { text: "Visitas ao perfil 30d" }))),
      h("tbody", {}, ...comOrg.map((b) => {
        const ig = b.organic.instagram, t30 = ig.totals?.last_30d || {};
        const reach30 = (ig.daily?.reach || []).filter((pt) => pt.date >= addDays(state.range.until, -29));
        return h("tr", {},
          h("td", {}, spanDot(b.accent || "#888"), " ", b.name),
          h("td", { text: "@" + (ig.username || "") }), h("td", { text: fmt.int(ig.followers) }),
          h("td", { text: fmt.int(ig.media_count) }),
          h("td", { text: reach30.length ? fmt.int(sum(reach30, (pt) => pt.value)) : "—" }),
          h("td", { text: fmt.int(t30.profile_views) }));
      }))))));
  }
}


/* Consolidado das contas em "frentes": pago (por objetivo) e orgânico na mesma página. */
function renderConsolidadoFrentes(sec, vivas, porMarca) {
  const frAll = new Map();
  for (const x of porMarca) for (const g of frentes(x.rows, x.b.idx)) {
    if (!frAll.has(g.def.label)) frAll.set(g.def.label, { def: g.def, rows: [] });
    frAll.get(g.def.label).rows.push(...g.rows);
  }
  const frL = Array.from(frAll.values()).map((g) => ({ ...g, agg: aggregate(g.rows) })).sort((a, b) => b.agg.spend - a.agg.spend);
  const metaTotal = sum(porMarca, (x) => x.all.spend), prevTotal = sum(porMarca, (x) => x.prev.spend);
  const verbas = vivas.map((b) => b.budget?.meta_monthly).filter((v) => ok(v));
  const verbaTotal = verbas.length === vivas.length ? sum(verbas) : null;
  const igs = vivas.map((b) => b.organic?.instagram).filter(Boolean);
  const corte30 = addDays(state.range.until, -29);
  const serie30 = (ig, k) => (ig.daily?.[k] || []).filter((p) => p.date >= corte30);
  const novos30 = sum(igs, (ig) => sum(serie30(ig, "follower_count"), (p) => p.value));
  const alcance30 = sum(igs, (ig) => sum(serie30(ig, "reach"), (p) => p.value));
  const visitas30 = sum(igs, (ig) => ig.totals?.last_30d?.profile_views || 0);
  const instalacoes = sum(porMarca, (x) => x.all.installs), cadastros = sum(porMarca, (x) => x.all.app_registrations);
  const temApp = vivas.some((b) => temAppNa(b.meta, b.idx));

  sec.append(block("Visão consolidada", `${vivas.length > 1 ? `as ${vivas.length} contas do Meta` : "Meta Ads"}, orgânico${temApp ? " e app" : ""} · ${fmt.date(state.since)} a ${fmt.date(state.until)}`,
    h("div", { class: "grid c4" },
      tile({ label: "Investimento no Meta", value: fmt.brl(metaTotal), delta: deltaBadge(metaTotal, prevTotal, { goodWhenUp: false, kind: "brl" }), accent: true, hero: true,
        sub: frL.map((g) => `${curtoFrente(g.def)} ${fmt.brl(g.agg.spend)}`).join(" · ") || "sem investimento no período" }),
      ...frL.filter((g) => g.def.kind !== "awareness").map((g) => tile({ label: g.def.label, value: fmt.int(resultsOf(g.agg, g.def)), accent: true,
        sub: ok(costPerResult(g.agg, g.def)) ? `${fmt.brl(costPerResult(g.agg, g.def))} por ${g.def.unit}` : `sem ${g.def.unit} no período` })),
      temApp ? tile({ label: "Cadastros no app", value: fmt.int(cadastros), sub: instalacoes ? `${fmt.dec1((cadastros / instalacoes) * 100)}% das instalações` : "sem instalações no período" }) : null,
      igs.length ? tile({ label: "Seguidores no Instagram", value: fmt.int(sum(igs, (ig) => ig.followers)), sub: `${novos30 ? "+" + fmt.int(novos30) : "—"} nos últimos 30 dias · ${igs.map((ig) => "@" + ig.username).join(", ")}` }) : null,
      igs.length ? tile({ label: "Alcance do Instagram (30d)", value: fmt.int(alcance30 || null), sub: `orgânico + pago · ${fmt.int(visitas30 || null)} visitas ao perfil` }) : null,
      tile({ label: "Verba Meta / mês", value: verbaTotal != null ? fmt.brl(verbaTotal) : "—", sub: verbaTotal != null ? (vivas.length > 1 ? "soma das marcas" : "definida no config") : "ainda não definida" }),
    )));

  const days = []; for (let d = state.since; d <= state.until; d = addDays(d, 1)) days.push(d);
  const labels = days.map(fmt.dm);
  const investSeries = frL.map((g) => { const bd = groupBy(g.rows, "date"); return { name: g.def.label, color: corFrente(g.def), values: days.map((d) => bd.get(d)?.spend || 0) }; });
  const alcanceIG = new Map();
  for (const ig of igs) for (const pt of ig.daily?.reach || []) alcanceIG.set(pt.date, (alcanceIG.get(pt.date) || 0) + pt.value);
  const temAlcance = days.some((d) => alcanceIG.has(d));
  sec.append(h("div", { class: "grid c2" },
    chartCard("Investimento por dia", "empilhado por frente", investSeries, { labels, type: "bar", stacked: true, format: fmt.brl }),
    temAlcance
      ? chartCard("Alcance diário do Instagram", "orgânico + pago · dias fora da janela coletada ficam vazios", [{ name: "Alcance", color: "#d55181", values: days.map((d) => (alcanceIG.has(d) ? alcanceIG.get(d) : null)) }], { labels, type: "bar" })
      : chartCard("Cliques no link por dia", "todas as campanhas", [{ name: "Cliques", color: "#3987e5", values: days.map((d) => sum(porMarca, (x) => groupBy(x.rows, "date").get(d)?.link_clicks || 0)) }], { labels, type: "bar" }),
  ));

  const frCols = frL.filter((g) => g.def.kind !== "awareness");
  sec.append(block("Por conta", "mesma janela", h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Marca" }), h("th", { text: "Conta" }), h("th", { text: "Investimento" }), ...frCols.map((g) => h("th", { text: g.def.label })), temApp ? h("th", { text: "Cadastros app" }) : null, h("th", { text: "Impressões" }), h("th", { text: "CPM" }), h("th", { text: "CTR do link" }))),
    h("tbody", {}, ...porMarca.map((x) => {
      const fx = new Map(frentes(x.rows, x.b.idx).map((g) => [g.def.label, g]));
      return h("tr", {},
        h("td", {}, spanDot(x.b.accent || "#888"), " ", x.b.name),
        h("td", { class: "faint", text: x.b.meta.account?.name || x.b.meta.account?.id }),
        h("td", { text: fmt.brl(x.all.spend) }),
        ...frCols.map((g) => { const y = fx.get(g.def.label); return h("td", {}, fmt.int(y ? resultsOf(y.agg, y.def) : 0), y && resultsOf(y.agg, y.def) ? h("span", { class: "faint", text: ` · ${fmt.brl(costPerResult(y.agg, y.def))}` }) : null); }),
        temApp ? h("td", { text: fmt.int(x.all.app_registrations) }) : null,
        h("td", { text: fmt.int(x.all.impressions) }), h("td", { text: fmt.brl(x.all.cpm) }), h("td", { text: fmt.pct(x.all.link_ctr) }));
    }))))));

  if (igs.length) {
    sec.append(block("Audiência orgânica", "perfil do Instagram e página do Facebook", h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Marca" }), h("th", { text: "Perfil" }), h("th", { text: "Seguidores" }), h("th", { text: "Novos (30d)" }), h("th", { text: "Publicações" }), h("th", { text: "Alcance 30d" }), h("th", { text: "Visitas ao perfil 30d" }), h("th", { text: "Seguidores Facebook" }))),
      h("tbody", {}, ...vivas.filter((b) => b.organic?.instagram).map((b) => {
        const ig = b.organic.instagram, fb = b.organic.facebook, t30 = ig.totals?.last_30d || {};
        const r30 = serie30(ig, "reach"), n30 = serie30(ig, "follower_count");
        return h("tr", {},
          h("td", {}, spanDot(b.accent || "#888"), " ", b.name),
          h("td", { text: "@" + (ig.username || "") }), h("td", { text: fmt.int(ig.followers) }),
          h("td", { text: n30.length ? "+" + fmt.int(sum(n30, (pt) => pt.value)) : "—" }),
          h("td", { text: fmt.int(ig.media_count) }),
          h("td", { text: r30.length ? fmt.int(sum(r30, (pt) => pt.value)) : "—" }),
          h("td", { text: fmt.int(t30.profile_views) }),
          h("td", { text: fb ? fmt.int(fb.followers ?? fb.fans) : "—" }));
      }))))));
  }
}

/* ======================================================== seção: legendas */
function renderLegend() {
  const sec = $("#sec-legendas"); sec.replaceChildren();
  const T = state.targets;
  const dl = (pairs) => h("dl", { class: "dl" }, ...pairs.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]));
  const metaTxt = (k) => (ok(T[k]) ? `Meta atual: ${fmt.brl(T[k])}.` : "Ainda sem meta acordada — o painel mostra o custo sem selo.");
  sec.append(
    block("Frentes da The Edit", "cada campanha é medida pelo resultado que ela otimiza", h("div", { class: "card" }, dl([
      ["Visitas na LP", "Visualizações da página de destino (landing_page_view): a pessoa clicou e a página carregou. É o resultado das campanhas de tráfego para a LP. " + metaTxt("cost_per_lpv")],
      ["Visitas ao perfil", "Resultado das campanhas de tráfego para o Instagram. A API não expõe a visita em si; usamos os cliques no link, que é o mesmo número que o Gerenciador mostra nessas campanhas. " + metaTxt("cost_per_profile_visit")],
      ["Instalações do app", "Instalações atribuídas aos anúncios de promoção do app (mobile_app_install), medidas pelo SDK da Meta. " + metaTxt("cost_per_install")],
      ["Cadastros no app", "Evento de cadastro concluído enviado pelo app (fb_mobile_complete_registration). Mostra quantos instaladores chegaram a criar conta. " + metaTxt("cost_per_app_registration")],
      ["Frente", "Agrupamento das campanhas pelo resultado otimizado. O custo por resultado de cada frente usa só o gasto das campanhas daquela frente."],
      ["Criativo mais eficiente", "Nas frentes, comparamos o custo de cada criativo com a média da própria frente — visita na LP e instalação têm custos de natureza diferente e não se comparam direto."],
    ]))),
    block("App", "eventos do SDK da Meta atribuídos às campanhas de app", h("div", { class: "card" }, dl([
      ["Funil do app", "Impressão → clique para a loja → instalação → cadastro. A etapa com a menor passagem é onde agir primeiro."],
      ["Eventos do app", "Tudo o que o app enviou para a Meta e que foi atribuído às campanhas de app: aberturas, conteúdo visto, favoritos, cadastros etc. Os nomes vêm do SDK (app_custom_event.*)."],
      ["Atribuição", "A Meta atribui a instalação ao anúncio pela janela configurada no conjunto (no iOS, com as limitações do SKAdNetwork/ATT). O total de downloads do app está na App Store Connect, que inclui também quem chegou sem anúncio."],
    ]))),
    block("Métricas", "", h("div", { class: "card" }, dl([
      ["Alcance", "Contas únicas que viram o anúncio. Não soma entre dias — os atalhos de período usam o valor exato da API; períodos personalizados somam o alcance diário (aproximação)."],
      ["Frequência", "Impressões ÷ alcance. Acima de " + fmt.dec1(T.frequency_max) + " indica saturação do público."],
      ["CPM", "Custo por mil impressões."],
      ["CTR do link", "Cliques no link ÷ impressões. Nas tabelas de campanha, CTR e CPC usam todos os cliques (como o Gerenciador)."],
      ["CPC", "Custo por clique."],
      ["ThruPlay", "Reproduções de vídeo de 15 s ou até o fim (quando menor)."],
      ["Visualizadores únicos (Facebook)", "A Meta aposentou o Alcance de Página em 15/06/2026 e colocou no lugar “visualizadores únicos de conteúdo”. Não é a mesma conta, por isso o rótulo é outro. O alcance do Instagram e o dos anúncios não foram afetados."],
      ["Orgânico", "Instagram: seguidores, novos seguidores, alcance, visitas ao perfil, contas engajadas, visualizações e métricas por publicação. O alcance diário do Instagram inclui o que veio de anúncio."],
    ]))),
    block("Status e qualidade", "", h("div", { class: "card" }, dl([
      ["● Na meta", "Custo por resultado igual ou abaixo da meta — manter."],
      ["▲ Atenção", "Custo até 1,6× a meta, ou sem resultado com gasto baixo — otimizar segmentação/criativo ou observar."],
      ["■ Crítico", "Custo acima de 1,6× a meta, ou gasto ≥ " + fmt.brl(T.min_spend_for_alert) + " sem nenhum resultado — reduzir verba, pausar ou revisar."],
      ["○ Sem meta", "Ainda não há meta para aquele resultado. Defina no menu lateral (fica salvo neste navegador) ou no config.json (vale para todos)."],
      ["Ativo / Pausado / Com problema", "Status efetivo de entrega informado pela Meta (considera campanha, conjunto, análise e cobrança)."],
      ["Período anterior", "Todas as variações (↑ ↓) comparam com o período imediatamente anterior de mesma duração."],
    ]))),
    block("Fontes e atualização", "", h("div", { class: "card" }, dl([
      ["Meta Ads", state.brands.filter((b) => b.meta).map((b) => `${b.name}: conta ${b.meta.account.id} (${b.meta.account.name}), série diária desde ${fmt.date(b.meta.range.since)}`).join(" · ") || "nenhuma conta coletada"],
      ["Orgânico", state.brands.map((b) => `${b.name}: Instagram @${b.meta_cfg?.ig_username || "—"} · Página ${b.meta_cfg?.page_name || "—"}`).join(" · ") + ". Séries dos últimos 30/90 dias; métricas por publicação via Instagram Insights."],
      ["Atualização", "Automática todo dia às 7h (Brasília) via GitHub Actions, com publicação no Cloudflare Pages. Última coleta: " + (state.brands.filter((b) => b.meta).map((b) => `${b.short || b.name} ${fmt.dateTime(b.meta.generated_at)}`).join(" · ") || "—") + "."],
      ["Metas", "Editáveis no menu lateral (ficam salvas apenas neste navegador). Padrão definido em config.json."],
    ]))),
  );
}

/* =================================================================== menu */
const SECOES_MARCA = [
  { section: "exec", ico: "◉", label: "Visão executiva" },
  { section: "meta", ico: "◈", label: "Meta Ads" },
  { section: "criativos", ico: "▤", label: "Criativos" },
  { section: "organico", ico: "◍", label: "Orgânico (IG + FB)" },
];

function buildNav() {
  const root = $("#nav-root");
  root.replaceChildren();
  const gcfg = state.config.google_ads || {};

  const grupo = (label, itens, cor) => {
    const txt = h("span", { class: "nl-txt" });
    if (cor) txt.append(spanDot(cor));
    txt.append(document.createTextNode(label));
    const g = h("div", { class: cor ? "nav-group marca" : "nav-group" }, h("div", { class: "nav-label" }, txt));
    if (cor) g.style.setProperty("--marca", cor);
    for (const it of itens) {
      const a = h("a", { class: "nav-item", href: `#${it.scope}/${it.section}` },
        h("span", { class: "ico", text: it.ico }), it.label);
      a.dataset.scope = it.scope; a.dataset.section = it.section;
      a.addEventListener("click", (e) => { e.preventDefault(); go(it.scope, it.section); });
      g.append(a);
    }
    root.append(g);
  };

  grupo("Geral", [{ scope: "geral", section: "consolidado", ico: "◎", label: "Visão consolidada" }]);
  for (const b of state.brands) {
    const itens = SECOES_MARCA.map((x) => ({ ...x, scope: b.id }));
    if (b.app?.enabled || temAppNa(b.meta, b.idx)) itens.push({ scope: b.id, section: "app", ico: "◆", label: "App" });
    if (gcfg.enabled && gcfg.brand_id === b.id) itens.push({ scope: b.id, section: "google", ico: "◇", label: "Google Ads" });
    if (state.config.clarity?.enabled && state.config.clarity.brand_id === b.id) itens.push({ scope: b.id, section: "site", ico: "◐", label: "Comportamento no site" });
    grupo(b.name, itens, b.accent);
  }
  grupo("Referência", [{ scope: "geral", section: "legendas", ico: "≡", label: "Legendas" }]);
}

function activateBrand(id) {
  const b = brandById(id);
  if (!b) return false;
  state.brandId = b.id; state.brand = b;
  state.meta = b.meta; state.organic = b.organic;
  idx = b.idx;
  state.targets = loadTargets(b);
  return true;
}

function go(scope, section) {
  if (scope !== "geral" && scope !== state.brandId) activateBrand(scope);
  state.scope = scope; state.section = section;
  const novo = `#${scope}/${section}`;
  if (location.hash !== novo) history.replaceState(null, "", novo);
  renderAll();
}

/* ================================================================ header */
function renderHeader() {
  const c = state.config.client;
  const b = state.brand;
  $("#brand-name").textContent = c.name;
  $("#brand-sub").textContent = c.agency || "Performance";
  $("#brand-market").textContent = c.market;
  $("#topbar-sub").textContent = state.scope === "geral"
    ? `${c.segment} · ${state.brands.length > 1 ? `as ${state.brands.length} contas do Meta` : "Meta Ads"}, orgânico${state.brands.some((x) => x.app?.enabled) ? " e app" : ""}${state.config.google_ads?.enabled ? " e Google Ads" : ""}`
    : `${b.name} · ${b.role || c.segment}`;
  $("#hdr-account").textContent = state.scope === "geral"
    ? "todas"
    : (b.meta ? `${b.meta.account.name} · ${b.meta.account.id}` : b.meta_cfg?.ad_account_id || "—");
  $("#hdr-period").textContent = `${fmt.date(state.since)} — ${fmt.date(state.until)}`;
  $("#hdr-compare").textContent = `${fmt.date(state.prevSince)} — ${fmt.date(state.prevUntil)}`;
  const coletas = state.brands.filter((x) => x.meta).map((x) => x.meta.generated_at).sort();
  $("#hdr-updated").textContent = coletas.length ? fmt.dateTime(coletas[coletas.length - 1]) : "—";
  $("#f-note").textContent = `Dados disponíveis de ${fmt.date(state.range.since)} a ${fmt.date(state.range.until)}`;
  $("#f-since").value = state.since; $("#f-until").value = state.until;
  $("#f-since").min = state.range.since; $("#f-until").max = state.range.until;

  $("#t-scope").textContent = state.scope === "geral" ? "Metas" : `Metas · ${b.short || b.name}`;
  const meta = (k) => (ok(state.targets[k]) ? fmt.brl(state.targets[k]) : "a definir");
  $("#t-lpv").textContent = meta("cost_per_lpv");
  $("#t-visit").textContent = meta("cost_per_profile_visit");
  $("#t-install").textContent = meta("cost_per_install");
  $("#t-appreg").textContent = meta("cost_per_app_registration");
  $("#t-budget").textContent = ok(state.targets.meta_monthly) ? fmt.brl(state.targets.meta_monthly) : "não definida";

  for (const a of $$(".nav-item")) a.classList.toggle("active", a.dataset.scope === state.scope && a.dataset.section === state.section);

  // avisos: só os da marca que está na tela, senão vira ruído
  const warnings = (state.scope === "geral" ? state.brands.flatMap((x) => (x.meta?.warnings || []).map((w) => `${x.short || x.name}: ${w}`)) : (state.meta?.warnings || []));
  const banner = $("#banner");
  if (warnings.length) { banner.hidden = false; banner.replaceChildren(h("b", { text: "Avisos da última coleta:" }), h("ul", {}, ...warnings.slice(0, 6).map((w) => h("li", { text: w })))); } else banner.hidden = true;
}

function semDados(titulo) {
  return block(titulo, "", h("div", { class: "placeholder" },
    h("b", { text: `Sem dados coletados para ${state.brand?.name || "esta marca"}` }),
    h("span", { text: "A última coleta falhou ou ainda não rodou para esta conta. As outras marcas seguem funcionando." })));
}

function renderAll() {
  computePeriod();
  renderHeader();
  renderConsolidado();
  renderLegend();
  if (state.meta) {
    renderExec(); renderMeta(); renderCreatives(); renderOrganic(); renderApp(); renderGoogle(); renderSite();
  } else {
    for (const [id, t] of [["exec", "Visão executiva"], ["meta", "Meta Ads"], ["criativos", "Criativos"], ["organico", "Orgânico"], ["app", "App"], ["google", "Google Ads"], ["site", "Comportamento no site"]]) {
      const el = $(`#sec-${id}`); el.replaceChildren(semDados(t));
    }
  }
  showSection(state.scope, state.section);
}

function showSection(scope, section) {
  state.scope = scope; state.section = section;
  for (const s of $$(".section")) s.hidden = s.id !== `sec-${section}`;
  for (const a of $$(".nav-item")) a.classList.toggle("active", a.dataset.scope === scope && a.dataset.section === section);
  // gráficos precisam de largura real para renderizar
  requestAnimationFrame(() => $$(".chart-card").forEach((c) => c._render && c._render()));
  window.scrollTo({ top: 0 });
}

/* ================================================================== boot */
async function fetchJson(url, { optional = false } = {}) {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401) { location.href = "/login"; throw new Error("sessão expirada"); }
  if (!res.ok) { if (optional) return null; throw new Error(`${url}: HTTP ${res.status}`); }
  return res.json();
}

function lerRota() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return null;
  const [scope, section] = hash.includes("/") ? hash.split("/") : ["geral", hash];
  const validas = new Set(["consolidado", "legendas", "exec", "meta", "criativos", "organico", "app", "google", "site"]);
  if (!validas.has(section)) return null;
  if (scope !== "geral" && !brandById(scope)) return null;
  return { scope, section };
}

async function boot() {
  tooltipEl = $("#tooltip");
  try {
    state.config = await fetchJson("/config.json");
  } catch (e) {
    $("#banner").hidden = false; $("#banner").classList.add("error"); $("#banner").textContent = `Falha ao carregar a configuração: ${e.message}`;
    return;
  }

  // uma marca que falhou não derruba a outra: cada arquivo é opcional
  state.brands = await Promise.all((state.config.brands || []).map(async (b) => {
    const [meta, organic] = await Promise.all([
      fetchJson(`/data/meta-${b.id}.json`, { optional: true }),
      fetchJson(`/data/organic-${b.id}.json`, { optional: true }),
    ]);
    return { ...b, meta_cfg: b.meta, meta, organic, idx: meta ? buildIndexes(meta) : null };
  }));
  if (state.config.google_ads?.enabled) state.google = await fetchJson("/data/google.json", { optional: true });
  if (state.config.clarity?.enabled) state.clarity = await fetchJson("/data/clarity.json", { optional: true });

  const comDados = state.brands.filter((b) => b.meta);
  if (!comDados.length) {
    $("#banner").hidden = false; $("#banner").classList.add("error");
    $("#banner").textContent = "Ainda não há dados coletados (public/data/meta-*.json). Rode o workflow “Atualizar dashboard” no GitHub Actions ou `python scripts/fetch_meta.py` com META_ACCESS_TOKEN.";
    return;
  }
  if (comDados.length < state.brands.length) {
    const faltam = state.brands.filter((b) => !b.meta).map((b) => b.name).join(", ");
    $("#banner").hidden = false; $("#banner").textContent = `Sem dados coletados para: ${faltam}. As demais marcas estão atualizadas.`;
  }

  // janela global = união das janelas das marcas
  state.range = {
    since: comDados.map((b) => b.meta.range.since).sort()[0],
    until: comDados.map((b) => b.meta.range.until).sort().slice(-1)[0],
  };

  buildNav();
  activateBrand(comDados[0].id);

  const span = daysBetween(state.range.since, state.range.until);
  state.preset = span <= 45 ? "max" : "30";
  $("#f-preset").value = state.preset;

  const rota = lerRota();
  state.scope = rota ? rota.scope : "geral";
  state.section = rota ? rota.section : "consolidado";
  if (state.scope !== "geral") activateBrand(state.scope);

  $("#f-preset").addEventListener("change", (e) => { state.preset = e.target.value; if (state.preset !== "custom") renderAll(); });
  $("#f-apply").addEventListener("click", () => {
    const s = $("#f-since").value, u = $("#f-until").value;
    if (s && u && s <= u) { state.preset = "custom"; $("#f-preset").value = "custom"; state.since = s; state.until = u; renderAll(); }
  });
  for (const inp of ["#f-since", "#f-until"]) $(inp).addEventListener("change", () => { $("#f-preset").value = "custom"; state.preset = "custom"; });
  window.addEventListener("hashchange", () => { const r = lerRota(); if (r) go(r.scope, r.section); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => $$(".chart-card").forEach((c) => c._render && c._render()), 150); });

  const form = $("#targets-form");
  const campos = ["cost_per_lpv", "cost_per_profile_visit", "cost_per_install", "cost_per_app_registration", "meta_monthly", "frequency_max"];
  $("#btn-edit-targets").addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) for (const k of campos) form.elements[k].value = ok(state.targets[k]) ? state.targets[k] : "";
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = { ...state.targets };
    for (const k of campos) { const v = parseFloat(form.elements[k].value); if (ok(v) && v > 0) t[k] = v; }
    state.targets = t;
    // a meta é da marca ativa; no consolidado não há o que salvar
    if (state.brandId) saveTargets(state.brandId, t);
    form.hidden = true; renderAll();
  });
  $("#btn-reset-targets").addEventListener("click", () => {
    try { if (state.brandId) localStorage.removeItem(targetsKey(state.brandId)); } catch { /* ignore */ }
    if (state.brand) state.targets = loadTargets(state.brand);
    form.hidden = true; renderAll();
  });

  renderAll();
}
document.addEventListener("DOMContentLoaded", boot);

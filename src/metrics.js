// Extração de métricas das linhas de Insights da Meta e mapeamento do
// "resultado" de cada campanha/conjunto conforme a meta de otimização.

export const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function actionMap(list) {
  const out = {};
  for (const item of list || []) {
    if (!item || !item.action_type) continue;
    out[item.action_type] = (out[item.action_type] || 0) + num(item.value);
  }
  return out;
}

function first(map, keys) {
  for (const key of keys) if (map[key] != null) return map[key];
  return 0;
}

function sumList(list) {
  return (list || []).reduce((acc, item) => acc + num(item && item.value), 0);
}

// Ordem de preferência dos action_types para cada métrica.
const ACTION_KEYS = {
  lpv: ['omni_landing_page_view', 'landing_page_view'],
  install: ['mobile_app_install', 'omni_app_install', 'app_install'],
  registration: [
    'omni_complete_registration',
    'app_custom_event.fb_mobile_complete_registration',
    'complete_registration',
    'offsite_conversion.fb_pixel_complete_registration',
  ],
  purchase: ['omni_purchase', 'purchase', 'app_custom_event.fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase'],
  add_to_cart: ['omni_add_to_cart', 'add_to_cart', 'app_custom_event.fb_mobile_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  initiate_checkout: [
    'omni_initiated_checkout',
    'initiate_checkout',
    'app_custom_event.fb_mobile_initiated_checkout',
    'offsite_conversion.fb_pixel_initiate_checkout',
  ],
  view_content: ['omni_view_content', 'view_content', 'app_custom_event.fb_mobile_content_view', 'offsite_conversion.fb_pixel_view_content'],
  lead: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  message: ['onsite_conversion.messaging_conversation_started_7d'],
  engagement: ['post_engagement'],
  page_like: ['like'],
};

export const ADDITIVE_KEYS = [
  'spend',
  'impressions',
  'clicks',
  'link_clicks',
  'lpv',
  'install',
  'registration',
  'app_registration',
  'purchase',
  'purchase_value',
  'add_to_cart',
  'initiate_checkout',
  'view_content',
  'lead',
  'message',
  'engagement',
  'page_like',
  'post_save',
  'video_view',
  'thruplay',
];

export function emptyMetrics() {
  const m = { reach: null, frequency: null, actions: {} };
  for (const key of ADDITIVE_KEYS) m[key] = 0;
  return m;
}

export function extract(row = {}) {
  const a = actionMap(row.actions);
  const v = actionMap(row.action_values);
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: row.reach != null ? num(row.reach) : null,
    frequency: row.frequency != null ? num(row.frequency) : null,
    clicks: num(row.clicks),
    link_clicks: row.inline_link_clicks != null ? num(row.inline_link_clicks) : a.link_click || 0,
    lpv: first(a, ACTION_KEYS.lpv),
    install: first(a, ACTION_KEYS.install),
    registration: first(a, ACTION_KEYS.registration),
    app_registration: a['app_custom_event.fb_mobile_complete_registration'] || 0,
    purchase: first(a, ACTION_KEYS.purchase),
    purchase_value: first(v, ACTION_KEYS.purchase),
    add_to_cart: first(a, ACTION_KEYS.add_to_cart),
    initiate_checkout: first(a, ACTION_KEYS.initiate_checkout),
    view_content: first(a, ACTION_KEYS.view_content),
    lead: first(a, ACTION_KEYS.lead),
    message: first(a, ACTION_KEYS.message),
    engagement: first(a, ACTION_KEYS.engagement),
    page_like: first(a, ACTION_KEYS.page_like),
    post_save: a['onsite_conversion.post_save'] || 0,
    video_view: a.video_view || 0,
    thruplay: sumList(row.video_thruplay_watched_actions),
    actions: a,
  };
}

// Soma métricas aditivas (alcance/frequência não são somáveis entre linhas).
export function addMetrics(target, source) {
  for (const key of ADDITIVE_KEYS) target[key] += source[key] || 0;
  for (const [type, value] of Object.entries(source.actions || {})) {
    target.actions[type] = (target.actions[type] || 0) + value;
  }
  return target;
}

export function sumMetrics(list) {
  return list.reduce((acc, m) => addMetrics(acc, m), emptyMetrics());
}

// ---------- Resultado por objetivo ----------

export const RESULT_TYPES = {
  lpv: { label: 'Visualizações da página de destino', short: 'Visitas na LP', cost: 'Custo por visita na LP' },
  profile_visit: { label: 'Visitas ao perfil do Instagram', short: 'Visitas ao perfil', cost: 'Custo por visita ao perfil' },
  install: { label: 'Instalações do app', short: 'Instalações', cost: 'Custo por instalação (CPI)' },
  registration: { label: 'Cadastros', short: 'Cadastros', cost: 'Custo por cadastro' },
  link_click: { label: 'Cliques no link', short: 'Cliques no link', cost: 'Custo por clique (CPC)' },
  purchase: { label: 'Compras', short: 'Compras', cost: 'Custo por compra' },
  add_to_cart: { label: 'Adições ao carrinho', short: 'Carrinhos', cost: 'Custo por carrinho' },
  initiate_checkout: { label: 'Finalizações de compra iniciadas', short: 'Checkouts', cost: 'Custo por checkout' },
  view_content: { label: 'Visualizações de conteúdo', short: 'Visualizações', cost: 'Custo por visualização' },
  lead: { label: 'Leads', short: 'Leads', cost: 'Custo por lead' },
  message: { label: 'Conversas por mensagem iniciadas', short: 'Conversas', cost: 'Custo por conversa' },
  engagement: { label: 'Engajamentos com a publicação', short: 'Engajamentos', cost: 'Custo por engajamento' },
  thruplay: { label: 'ThruPlays (vídeo)', short: 'ThruPlays', cost: 'Custo por ThruPlay' },
  reach: { label: 'Pessoas alcançadas', short: 'Alcance', cost: 'Custo por mil pessoas' },
  impressions: { label: 'Impressões', short: 'Impressões', cost: 'CPM' },
  page_like: { label: 'Curtidas na página', short: 'Curtidas', cost: 'Custo por curtida' },
};

export function resultValue(m, key) {
  if (!m || !key) return 0;
  switch (key) {
    case 'profile_visit':
    case 'link_click':
      return m.link_clicks || 0;
    case 'reach':
      return m.reach || 0;
    default:
      return m[key] || 0;
  }
}

const EVENT_TO_KEY = {
  PURCHASE: 'purchase',
  COMPLETE_REGISTRATION: 'registration',
  LEAD: 'lead',
  ADD_TO_CART: 'add_to_cart',
  INITIATED_CHECKOUT: 'initiate_checkout',
  CONTENT_VIEW: 'view_content',
};

export function objectiveToKey(objective) {
  switch (objective) {
    case 'OUTCOME_APP_PROMOTION':
    case 'APP_INSTALLS':
    case 'MOBILE_APP_INSTALLS':
      return 'install';
    case 'OUTCOME_ENGAGEMENT':
    case 'POST_ENGAGEMENT':
    case 'PAGE_LIKES':
      return 'engagement';
    case 'OUTCOME_AWARENESS':
    case 'BRAND_AWARENESS':
    case 'REACH':
      return 'reach';
    case 'MESSAGES':
      return 'message';
    case 'OUTCOME_LEADS':
    case 'LEAD_GENERATION':
      return 'lead';
    case 'OUTCOME_SALES':
    case 'CONVERSIONS':
    case 'PRODUCT_CATALOG_SALES':
      return 'purchase';
    case 'VIDEO_VIEWS':
      return 'thruplay';
    default:
      return 'link_click';
  }
}

export function goalToKey(goal, promotedObject, objective) {
  const g = String(goal || '').toUpperCase();
  if (g.includes('PROFILE')) return 'profile_visit';
  switch (g) {
    case 'LANDING_PAGE_VIEWS':
      return 'lpv';
    case 'APP_INSTALLS':
    case 'APP_INSTALLS_AND_OFFSITE_CONVERSIONS':
      return 'install';
    case 'LINK_CLICKS':
      return 'link_click';
    case 'OFFSITE_CONVERSIONS':
    case 'VALUE':
    case 'APP_EVENTS': {
      const event = promotedObject && promotedObject.custom_event_type;
      return EVENT_TO_KEY[event] || objectiveToKey(objective);
    }
    case 'LEAD_GENERATION':
    case 'QUALITY_LEAD':
      return 'lead';
    case 'CONVERSATIONS':
    case 'REPLIES':
      return 'message';
    case 'POST_ENGAGEMENT':
      return 'engagement';
    case 'THRUPLAY':
      return 'thruplay';
    case 'REACH':
    case 'AD_RECALL_LIFT':
      return 'reach';
    case 'IMPRESSIONS':
      return 'impressions';
    case 'PAGE_LIKES':
      return 'page_like';
    default:
      return objectiveToKey(objective);
  }
}

export function isAppObjective(objective) {
  return ['OUTCOME_APP_PROMOTION', 'APP_INSTALLS', 'MOBILE_APP_INSTALLS'].includes(objective);
}

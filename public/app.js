/* The Edit · Dashboard (cliente) */
(() => {
  'use strict';

  // ====================================================================
  // Utilidades
  // ====================================================================

  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'style') Object.assign(el.style, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : String(value));
      }
    }
    appendAll(el, children);
    return el;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, String(value));
      }
    }
    appendAll(el, children);
    return el;
  }

  function appendAll(el, children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* armazenamento indisponível */
      }
    },
  };

  const div = (a, b) => (b > 0 && a != null ? a / b : null);
  const sum = (list, get) => list.reduce((acc, item) => acc + (get(item) || 0), 0);

  // ====================================================================
  // Formatação
  // ====================================================================

  let CURRENCY = 'BRL';
  const nfCache = new Map();
  function nf(opts) {
    const key = JSON.stringify(opts) + CURRENCY;
    if (!nfCache.has(key)) nfCache.set(key, new Intl.NumberFormat('pt-BR', opts));
    return nfCache.get(key);
  }
  const valid = (v) => v != null && Number.isFinite(v);

  const fmt = {
    money: (v) => {
      if (!valid(v)) return '—';
      const digits = Math.abs(v) >= 10000 ? 0 : 2;
      return nf({ style: 'currency', currency: CURRENCY, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    },
    int: (v) => (valid(v) ? nf({ maximumFractionDigits: 0 }).format(v) : '—'),
    compact: (v) => {
      if (!valid(v)) return '—';
      return Math.abs(v) >= 10000 ? nf({ notation: 'compact', maximumFractionDigits: 1 }).format(v) : nf({ maximumFractionDigits: 0 }).format(v);
    },
    pct: (v) => (valid(v) ? `${nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}%` : '—'),
    dec: (v) => (valid(v) ? nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : '—'),
  };

  const axisFmt = {
    money: (v, step) => {
      if (Math.abs(v) >= 10000) return nf({ style: 'currency', currency: CURRENCY, notation: 'compact', maximumFractionDigits: 1 }).format(v);
      const digits = step < 1 ? 2 : 0;
      return nf({ style: 'currency', currency: CURRENCY, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    },
    int: (v) => (Math.abs(v) >= 10000 ? nf({ notation: 'compact', maximumFractionDigits: 1 }).format(v) : nf({ maximumFractionDigits: 1 }).format(v)),
    pct: (v, step) => `${nf({ maximumFractionDigits: step < 1 ? 1 : 0 }).format(v)}%`,
  };

  const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function dayShort(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }
  function dayLong(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return `${wd}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  function dateBR(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  // ====================================================================
  // Dicionários
  // ====================================================================

  const METRICS = {
    spend: { label: 'Investimento', f: 'money', axis: 'money', better: 0, get: (m) => m.spend },
    impressions: { label: 'Impressões', f: 'compact', axis: 'int', better: 1, get: (m) => m.impressions },
    reach: { label: 'Alcance', f: 'compact', axis: 'int', better: 1, get: (m) => m.reach },
    frequency: { label: 'Frequência', f: 'dec', axis: 'int', better: 0, get: (m) => m.frequency },
    link_clicks: { label: 'Cliques no link', f: 'compact', axis: 'int', better: 1, get: (m) => m.link_clicks },
    ctr: {
      label: 'CTR (link)',
      f: 'pct',
      axis: 'pct',
      better: 1,
      rate: true,
      get: (m) => {
        const r = div(m.link_clicks, m.impressions);
        return r == null ? null : r * 100;
      },
    },
    cpc: { label: 'CPC (link)', f: 'money', axis: 'money', better: -1, rate: true, get: (m) => div(m.spend, m.link_clicks) },
    cpm: {
      label: 'CPM',
      f: 'money',
      axis: 'money',
      better: -1,
      rate: true,
      get: (m) => {
        const r = div(m.spend, m.impressions);
        return r == null ? null : r * 1000;
      },
    },
  };

  const RESULT_TYPES = {
    lpv: { label: 'Visualizações da página de destino', short: 'Visitas na LP', cost: 'Custo por visita na LP' },
    profile_visit: { label: 'Visitas ao perfil do Instagram', short: 'Visitas ao perfil', cost: 'Custo por visita ao perfil' },
    install: { label: 'Instalações do app', short: 'Instalações', cost: 'Custo por instalação' },
    registration: { label: 'Cadastros', short: 'Cadastros', cost: 'Custo por cadastro' },
    link_click: { label: 'Cliques no link', short: 'Cliques no link', cost: 'Custo por clique' },
    purchase: { label: 'Compras', short: 'Compras', cost: 'Custo por compra' },
    add_to_cart: { label: 'Adições ao carrinho', short: 'Carrinhos', cost: 'Custo por carrinho' },
    initiate_checkout: { label: 'Finalizações de compra iniciadas', short: 'Checkouts', cost: 'Custo por checkout' },
    view_content: { label: 'Visualizações de conteúdo', short: 'Visualizações', cost: 'Custo por visualização' },
    lead: { label: 'Leads', short: 'Leads', cost: 'Custo por lead' },
    message: { label: 'Conversas por mensagem iniciadas', short: 'Conversas', cost: 'Custo por conversa' },
    engagement: { label: 'Engajamentos com a publicação', short: 'Engajamentos', cost: 'Custo por engajamento' },
    thruplay: { label: 'ThruPlays (vídeo)', short: 'ThruPlays', cost: 'Custo por ThruPlay' },
    reach: { label: 'Pessoas alcançadas', short: 'Alcance', cost: 'Custo por pessoa' },
    impressions: { label: 'Impressões', short: 'Impressões', cost: 'Custo por impressão' },
    page_like: { label: 'Curtidas na página', short: 'Curtidas', cost: 'Custo por curtida' },
  };
  const RESULT_ORDER = Object.keys(RESULT_TYPES);
  const resultShort = (key) => (RESULT_TYPES[key] ? RESULT_TYPES[key].short : key || 'Resultados');

  const OBJECTIVES = {
    OUTCOME_TRAFFIC: 'Tráfego',
    OUTCOME_APP_PROMOTION: 'Promoção do app',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_LEADS: 'Cadastros (leads)',
    OUTCOME_SALES: 'Vendas',
    LINK_CLICKS: 'Tráfego (cliques)',
    POST_ENGAGEMENT: 'Engajamento',
    PAGE_LIKES: 'Curtidas na página',
    APP_INSTALLS: 'Instalações do app',
    MESSAGES: 'Mensagens',
    CONVERSIONS: 'Conversões',
    VIDEO_VIEWS: 'Visualizações de vídeo',
    REACH: 'Alcance',
    BRAND_AWARENESS: 'Reconhecimento',
    LEAD_GENERATION: 'Geração de cadastros',
    PRODUCT_CATALOG_SALES: 'Vendas do catálogo',
  };

  const STATUS = {
    ACTIVE: ['Ativa', 'good'],
    PAUSED: ['Pausada', 'idle'],
    CAMPAIGN_PAUSED: ['Campanha pausada', 'idle'],
    ADSET_PAUSED: ['Conjunto pausado', 'idle'],
    ARCHIVED: ['Arquivada', 'idle'],
    DELETED: ['Excluída', 'idle'],
    IN_PROCESS: ['Processando', 'warning'],
    PENDING_REVIEW: ['Em análise', 'warning'],
    PREAPPROVED: ['Pré-aprovada', 'warning'],
    PENDING_BILLING_INFO: ['Pagamento pendente', 'warning'],
    WITH_ISSUES: ['Com problemas', 'critical'],
    DISAPPROVED: ['Reprovada', 'critical'],
  };

  const ACTION_LABELS = {
    link_click: 'Cliques no link',
    landing_page_view: 'Visualizações da página de destino',
    mobile_app_install: 'Instalações do app',
    post_engagement: 'Engajamento com a publicação',
    page_engagement: 'Engajamento com a página',
    post_reaction: 'Reações',
    comment: 'Comentários',
    post: 'Compartilhamentos',
    'onsite_conversion.post_save': 'Salvamentos',
    like: 'Curtidas na página',
    video_view: 'Reproduções de vídeo (3 s)',
    photo_view: 'Visualizações de foto',
    'onsite_conversion.messaging_conversation_started_7d': 'Conversas iniciadas',
    'onsite_conversion.messaging_first_reply': 'Primeiras respostas em conversas',
    'onsite_conversion.total_messaging_connection': 'Conexões por mensagem',
    lead: 'Leads',
    complete_registration: 'Cadastros concluídos',
    purchase: 'Compras',
    add_to_cart: 'Adições ao carrinho',
    initiate_checkout: 'Finalizações de compra iniciadas',
    view_content: 'Visualizações de conteúdo',
    search: 'Buscas',
    add_to_wishlist: 'Adições à lista de desejos',
    contact: 'Contatos',
    'app_custom_event.fb_mobile_activate_app': 'Aberturas do app',
    'app_custom_event.fb_mobile_complete_registration': 'Cadastros no app',
    'app_custom_event.fb_mobile_content_view': 'Visualizações de conteúdo no app',
    'app_custom_event.fb_mobile_add_to_wishlist': 'Adições à lista de desejos no app',
    'app_custom_event.fb_mobile_add_to_cart': 'Adições ao carrinho no app',
    'app_custom_event.fb_mobile_initiated_checkout': 'Checkouts iniciados no app',
    'app_custom_event.fb_mobile_purchase': 'Compras no app',
    'app_custom_event.fb_mobile_search': 'Buscas no app',
    'app_custom_event.fb_mobile_rate': 'Avaliações no app',
    'app_custom_event.fb_mobile_tutorial_completion': 'Tutoriais concluídos',
    'app_custom_event.fb_mobile_add_payment_info': 'Dados de pagamento adicionados',
    'app_custom_event.fb_mobile_level_achieved': 'Níveis alcançados',
    'app_custom_event.fb_mobile_achievement_unlocked': 'Conquistas desbloqueadas',
    'app_custom_event.fb_mobile_spent_credits': 'Créditos gastos',
    'app_custom_event.fb_mobile_d2_retention': 'Retenção (dia 2)',
    'app_custom_event.fb_mobile_d7_retention': 'Retenção (dia 7)',
    'app_custom_event.other': 'Outros eventos do app',
  };

  // Tipos que duplicam outros na tabela "Todas as ações".
  const HIDDEN_ACTION_PREFIXES = ['omni_', 'onsite_web_', 'web_', 'offline_conversion.', 'onsite_app_', 'offsite_conversion.fb_pixel_'];

  function actionLabel(type) {
    if (ACTION_LABELS[type]) return ACTION_LABELS[type];
    if (type.startsWith('app_custom_event.')) return `Evento do app: ${type.slice(17).replace(/^fb_mobile_/, '').replace(/_/g, ' ')}`;
    if (type.startsWith('offsite_conversion.custom.')) return `Conversão personalizada ${type.slice(26)}`;
    if (type.startsWith('offsite_conversion.fb_pixel_')) return `Pixel: ${type.slice(28).replace(/_/g, ' ')}`;
    if (type.startsWith('onsite_conversion.')) return `No Facebook/Instagram: ${type.slice(18).replace(/_/g, ' ')}`;
    return type.replace(/[._]/g, ' ');
  }

  const GENDERS = { female: 'Mulheres', male: 'Homens', unknown: 'Não informado' };
  const PLATFORMS = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads', whatsapp: 'WhatsApp' };
  const POSITIONS = {
    feed: 'Feed',
    story: 'Stories',
    instagram_stories: 'Stories',
    facebook_stories: 'Stories',
    instagram_reels: 'Reels',
    facebook_reels: 'Reels',
    facebook_reels_overlay: 'Sobreposição em Reels',
    explore: 'Explorar',
    explore_home: 'Explorar (início)',
    instagram_explore: 'Explorar',
    instagram_explore_grid_home: 'Explorar (grade)',
    instagram_profile_feed: 'Feed do perfil',
    profile_feed: 'Feed do perfil',
    instagram_profile_reels: 'Reels do perfil',
    instagram_search: 'Resultados de busca',
    marketplace: 'Marketplace',
    video_feeds: 'Feeds de vídeo',
    instream_video: 'Vídeo in-stream',
    search: 'Resultados de busca',
    right_hand_column: 'Coluna da direita',
    an_classic: 'Nativo, banner e intersticial',
    rewarded_video: 'Vídeo com premiação',
    messenger_inbox: 'Caixa de entrada',
    messenger_stories: 'Stories',
    threads_feed: 'Feed',
    unknown: 'Não informado',
  };
  const DEVICES = {
    iphone: 'iPhone',
    ipad: 'iPad',
    ipod: 'iPod',
    android_smartphone: 'Android (celular)',
    android_tablet: 'Android (tablet)',
    desktop: 'Computador',
    other: 'Outros',
  };
  const prettify = (map, value) => map[value] || String(value || '—').replace(/_/g, ' ');

  // ====================================================================
  // Períodos
  // ====================================================================

  const pad = (n) => String(n).padStart(2, '0');
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const PRESETS = {
    today: { label: 'Hoje', range: () => [today(), today()] },
    yesterday: { label: 'Ontem', range: () => [addDays(today(), -1), addDays(today(), -1)] },
    last_7d: { label: 'Últimos 7 dias', range: () => [addDays(today(), -7), addDays(today(), -1)] },
    last_14d: { label: 'Últimos 14 dias', range: () => [addDays(today(), -14), addDays(today(), -1)] },
    last_30d: { label: 'Últimos 30 dias', range: () => [addDays(today(), -30), addDays(today(), -1)] },
    this_month: {
      label: 'Este mês',
      range: () => {
        const t = today();
        return [new Date(t.getFullYear(), t.getMonth(), 1), t];
      },
    },
    last_month: {
      label: 'Mês passado',
      range: () => {
        const t = today();
        return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
      },
    },
    last_90d: { label: 'Últimos 90 dias', range: () => [addDays(today(), -90), addDays(today(), -1)] },
    custom: { label: 'Personalizado' },
  };

  // ====================================================================
  // Estado
  // ====================================================================

  const TAB_HASH = { overview: 'visao-geral', campaigns: 'campanhas', creatives: 'criativos', app: 'app', audience: 'publico' };
  const HASH_TAB = Object.fromEntries(Object.entries(TAB_HASH).map(([k, v]) => [v, k]));

  const state = {
    preset: 'last_30d',
    since: '',
    until: '',
    tab: 'overview',
    report: null,
    reportReq: 0,
    lazy: new Map(), // cache de /api/ads e /api/breakdown por período
    dailyMetric: 'spend',
    dailyTable: false,
    campFilter: 'delivery',
    campSearch: '',
    campSort: { key: 'spend', dir: -1 },
    expanded: new Set(),
    adsSort: 'spend',
    adsScope: 'all',
    audScope: 'all',
    ageMetric: 'spend',
    refreshNext: false,
  };

  const colorSlots = new Map(); // entidade -> slot (cor segue a entidade, não a posição)
  function slotFor(id, used) {
    if (colorSlots.has(id) && !used.has(colorSlots.get(id))) return colorSlots.get(id);
    for (let i = 1; i <= 8; i += 1) {
      const slot = `s${i}`;
      if (!used.has(slot) && ![...colorSlots.values()].includes(slot)) {
        colorSlots.set(id, slot);
        return slot;
      }
    }
    for (let i = 1; i <= 8; i += 1) if (!used.has(`s${i}`)) return `s${i}`;
    return 'other';
  }

  // ====================================================================
  // API
  // ====================================================================

  async function api(path, params = {}) {
    const url = new URL(path, location.origin);
    url.searchParams.set('since', state.since);
    url.searchParams.set('until', state.until);
    for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, value);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (res.status === 401) {
      location.href = '/login';
      throw new Error('Sessão expirada.');
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok || !body || body.error) {
      throw new Error((body && body.error && body.error.message) || `Erro ${res.status} ao carregar dados.`);
    }
    return body;
  }

  function lazyKey(kind, extra = '') {
    return `${kind}|${state.since}|${state.until}|${extra}`;
  }

  // Carrega (com cache em memória) um recurso secundário e re-renderiza a aba quando chegar.
  function lazy(kind, path, params, extra) {
    const key = lazyKey(kind, extra);
    let entry = state.lazy.get(key);
    if (!entry) {
      const refresh = state.refreshNext ? '1' : null;
      entry = { status: 'loading', data: null, error: null };
      state.lazy.set(key, entry);
      api(path, { ...params, refresh })
        .then((data) => {
          entry.status = 'ready';
          entry.data = data;
        })
        .catch((err) => {
          entry.status = 'error';
          entry.error = err.message;
        })
        .finally(() => {
          if (state.lazy.get(key) === entry) renderTab();
        });
    }
    return entry;
  }

  // ====================================================================
  // Tooltip
  // ====================================================================

  const tip = $('#tooltip');

  function showTip(anchor, title, rows) {
    tip.replaceChildren(
      h('div', { class: 'tt-title' }, title),
      ...rows.map((row) => h('div', { class: 'tt-row' }, h('span', { class: `tt-key ${row.cls ? `bg-${row.cls}` : ''}` }), h('strong', null, row.value), h('span', null, row.label || ''))),
    );
    tip.hidden = false;
    const rect = tip.getBoundingClientRect();
    let x;
    let y;
    if (anchor && anchor.clientX != null) {
      x = anchor.clientX + 14;
      y = anchor.clientY - rect.height - 12;
    } else {
      const r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2 - rect.width / 2;
      y = r.top - rect.height - 8;
    }
    if (x + rect.width > window.innerWidth - 8) x = (anchor.clientX != null ? anchor.clientX - 14 : window.innerWidth) - rect.width;
    if (x < 8) x = 8;
    if (y < 8) y = (anchor.clientY != null ? anchor.clientY : 0) + 18;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function hideTip() {
    tip.hidden = true;
  }

  // ====================================================================
  // Gráficos (SVG)
  // ====================================================================

  let measureCtx;
  function textWidth(text, size = 11) {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    measureCtx.font = `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    return measureCtx.measureText(text).width;
  }

  function niceScale(maxValue, count = 4, integer = false) {
    if (!(maxValue > 0)) return integer ? { max: 1, step: 1 } : { max: 1, step: 0.25 };
    const raw = maxValue / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    if (integer) step = Math.max(1, Math.ceil(step));
    return { max: Math.ceil(maxValue / step - 1e-9) * step, step };
  }

  function barPath(x, y, w, hgt, r) {
    if (hgt <= 0) return '';
    const rr = Math.min(r, w / 2, hgt);
    return `M${x},${y + hgt}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + hgt}Z`;
  }

  // Desenha eixos e devolve a geometria comum.
  function frame(container, { values, axis, height = 260, labels }) {
    const width = Math.max(container.clientWidth, 280);
    const finite = values.filter(valid);
    const integer = axis === axisFmt.int && finite.every((v) => Number.isInteger(v));
    const { max, step } = niceScale(finite.length ? Math.max(...finite, 0) : 0, 4, integer);
    const ticks = [];
    for (let v = 0; v <= max + step / 1000; v += step) ticks.push(v);
    const tickText = ticks.map((t) => axis(t, step));
    const m = { t: 10, r: 6, b: 26, l: Math.ceil(Math.max(...tickText.map((t) => textWidth(t)))) + 10 };
    const iw = width - m.l - m.r;
    const ih = height - m.t - m.b;
    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img' });
    const y = (v) => m.t + ih - (v / max) * ih;
    ticks.forEach((t, i) => {
      if (i > 0) svg.append(s('line', { class: 'grid-line', x1: m.l, x2: width - m.r, y1: y(t), y2: y(t) }));
      svg.append(s('text', { class: 'axis-label', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, tickText[i]));
    });
    svg.append(s('line', { class: 'axis-line', x1: m.l, x2: width - m.r, y1: m.t + ih, y2: m.t + ih }));

    const n = labels.length;
    const slot = iw / Math.max(n, 1);
    const cx = (i) => m.l + slot * (i + 0.5);
    const maxLabels = Math.max(1, Math.floor(iw / 52));
    const every = Math.ceil(n / maxLabels);
    labels.forEach((label, i) => {
      if (i % every !== 0) return;
      svg.append(s('text', { class: 'axis-label', x: cx(i), y: height - 8, 'text-anchor': 'middle' }, label));
    });
    return { svg, width, height, m, iw, ih, y, slot, cx, max };
  }

  function emptyChart(container, message = 'Sem dados no período') {
    container.replaceChildren(h('div', { class: 'chart-empty' }, message));
  }

  function columnChart(container, { labels, titles, values, format, axis, name, cls = 's1', height }) {
    if (!values.some((v) => v > 0)) return emptyChart(container);
    const g = frame(container, { values, axis, labels, height });
    const bw = Math.max(1, Math.min(24, g.slot - 2));
    const bars = values.map((v, i) => {
      const top = g.y(Math.max(v || 0, 0));
      const bar = s('path', { class: `bar f-${cls}`, d: barPath(g.cx(i) - bw / 2, top, bw, g.m.t + g.ih - top, 4) });
      g.svg.append(bar);
      return bar;
    });
    const focusable = values.length <= 45;
    values.forEach((v, i) => {
      const hit = s('rect', {
        class: 'hit',
        x: g.m.l + g.slot * i,
        y: g.m.t,
        width: g.slot,
        height: g.ih,
        tabindex: focusable ? 0 : null,
        'aria-label': `${titles[i]}: ${format(v)}`,
      });
      const enter = (evt) => {
        container.classList.add('has-hover');
        bars[i].classList.add('is-hover');
        showTip(evt.clientX != null ? evt : hit, titles[i], [{ value: format(v), label: name, cls }]);
      };
      const leave = () => {
        container.classList.remove('has-hover');
        bars[i].classList.remove('is-hover');
        hideTip();
      };
      hit.addEventListener('pointerenter', enter);
      hit.addEventListener('pointermove', enter);
      hit.addEventListener('pointerleave', leave);
      hit.addEventListener('focus', () => enter({}));
      hit.addEventListener('blur', leave);
      g.svg.append(hit);
    });
    g.svg.setAttribute('aria-label', `${name} por dia`);
    container.replaceChildren(g.svg);
  }

  function lineChart(container, { labels, titles, values, format, axis, name, cls = 's1', height }) {
    if (!values.some((v) => valid(v) && v > 0)) return emptyChart(container);
    const g = frame(container, { values, axis, labels, height });
    let d = '';
    let area = '';
    let segStart = null;
    const base = g.m.t + g.ih;
    values.forEach((v, i) => {
      if (!valid(v)) {
        if (segStart != null) area += `L${g.cx(i - 1)},${base}L${g.cx(segStart)},${base}Z`;
        segStart = null;
        return;
      }
      const x = g.cx(i);
      const y = g.y(v);
      if (segStart == null) {
        d += `M${x},${y}`;
        area += `M${x},${y}`;
        segStart = i;
      } else {
        d += `L${x},${y}`;
        area += `L${x},${y}`;
      }
      if (i === values.length - 1) area += `L${x},${base}L${g.cx(segStart)},${base}Z`;
    });
    g.svg.append(s('path', { class: `area f-${cls}`, d: area }));
    g.svg.append(s('path', { class: `line st-${cls}`, d }));
    // pontos isolados (sem vizinhos) ficam visíveis como marcadores
    values.forEach((v, i) => {
      if (valid(v) && !valid(values[i - 1]) && !valid(values[i + 1])) g.svg.append(s('circle', { class: `dot f-${cls}`, cx: g.cx(i), cy: g.y(v), r: 4 }));
    });
    const cross = s('line', { class: 'crosshair', x1: 0, x2: 0, y1: g.m.t, y2: base, visibility: 'hidden' });
    const dot = s('circle', { class: `dot f-${cls}`, r: 5, visibility: 'hidden' });
    g.svg.append(cross, dot);
    const overlay = s('rect', { class: 'hit', x: g.m.l, y: g.m.t, width: g.iw, height: g.ih, tabindex: 0, 'aria-label': `${name}: use as setas para navegar pelos dias` });
    let current = values.length - 1;
    const show = (i, anchor) => {
      current = Math.max(0, Math.min(values.length - 1, i));
      const x = g.cx(current);
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      cross.setAttribute('visibility', 'visible');
      if (valid(values[current])) {
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', g.y(values[current]));
        dot.setAttribute('visibility', 'visible');
      } else dot.setAttribute('visibility', 'hidden');
      showTip(anchor || dot, titles[current], [{ value: format(values[current]), label: name, cls }]);
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      hideTip();
    };
    overlay.addEventListener('pointermove', (evt) => {
      const rect = g.svg.getBoundingClientRect();
      const scale = g.width / rect.width;
      const x = (evt.clientX - rect.left) * scale;
      show(Math.round((x - g.m.l) / g.slot - 0.5), evt);
    });
    overlay.addEventListener('pointerleave', hide);
    overlay.addEventListener('focus', () => show(current, cross));
    overlay.addEventListener('blur', hide);
    overlay.addEventListener('keydown', (evt) => {
      if (evt.key === 'ArrowLeft' || evt.key === 'ArrowRight') {
        evt.preventDefault();
        show(current + (evt.key === 'ArrowRight' ? 1 : -1), cross);
      }
    });
    g.svg.append(overlay);
    g.svg.setAttribute('aria-label', `${name} por dia`);
    container.replaceChildren(g.svg);
  }

  function groupedChart(container, { categories, series, format, axis, height = 240 }) {
    const all = series.flatMap((se) => se.values);
    if (!all.some((v) => v > 0)) return emptyChart(container);
    const g = frame(container, { values: all, axis, labels: categories, height });
    const nS = series.length;
    const bw = Math.max(2, Math.min(24, (g.slot * 0.78 - (nS - 1) * 2) / nS));
    const groupW = nS * bw + (nS - 1) * 2;
    const bars = [];
    categories.forEach((cat, ci) => {
      series.forEach((se, si) => {
        const v = se.values[ci] || 0;
        const x = g.cx(ci) - groupW / 2 + si * (bw + 2);
        const top = g.y(v);
        const bar = s('path', { class: `bar f-${se.cls}`, d: barPath(x, top, bw, g.m.t + g.ih - top, 4) });
        bars.push(bar);
        g.svg.append(bar);
        const hit = s('rect', { class: 'hit', x: x - 1, y: g.m.t, width: bw + 2, height: g.ih, tabindex: 0, 'aria-label': `${cat} · ${se.name}: ${format(v)}` });
        const enter = (evt) => {
          container.classList.add('has-hover');
          bar.classList.add('is-hover');
          showTip(evt.clientX != null ? evt : hit, cat, [{ value: format(v), label: se.name, cls: se.cls }]);
        };
        const leave = () => {
          container.classList.remove('has-hover');
          bar.classList.remove('is-hover');
          hideTip();
        };
        hit.addEventListener('pointerenter', enter);
        hit.addEventListener('pointermove', enter);
        hit.addEventListener('pointerleave', leave);
        hit.addEventListener('focus', () => enter({}));
        hit.addEventListener('blur', leave);
        g.svg.append(hit);
      });
    });
    container.replaceChildren(g.svg);
  }

  // Gráficos ativos na aba atual: redesenhados ao redimensionar a janela.
  let activeCharts = [];
  function mountChart(container, draw) {
    activeCharts.push({ container, draw });
    requestAnimationFrame(() => {
      if (container.isConnected) draw(container);
    });
  }
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      hideTip();
      activeCharts = activeCharts.filter((c) => c.container.isConnected);
      activeCharts.forEach((c) => c.draw(c.container));
    }, 150);
  });

  // ====================================================================
  // Componentes
  // ====================================================================

  function delta(cur, prev, better, { absolute = false } = {}) {
    if (!valid(cur) || !valid(prev) || prev === 0) {
      return h('span', { class: 'delta none' }, prev === 0 && cur > 0 ? 'novo' : '—');
    }
    const change = absolute ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(change) < 0.05) return h('span', { class: 'delta neutral' }, '= 0%');
    const up = change > 0;
    const tone = better === 0 ? 'neutral' : (up ? better > 0 : better < 0) ? 'good' : 'bad';
    const text = `${up ? '▲' : '▼'} ${nf({ maximumFractionDigits: 1 }).format(Math.abs(change))}${absolute ? ' p.p.' : '%'}`;
    return h('span', { class: `delta ${tone}`, title: 'vs período anterior' }, text);
  }

  function tile(label, value, foot, { key } = {}) {
    return h(
      'div',
      { class: 'tile' },
      h('span', { class: 'tile-label' }, key ? h('span', { class: `tile-key bg-${key}` }) : null, label),
      h('span', { class: 'tile-value' }, value),
      foot ? h('div', { class: 'tile-foot' }, foot) : null,
    );
  }

  function metricTile(key, cur, prev) {
    const def = METRICS[key];
    const v = def.get(cur);
    const pv = prev ? def.get(prev) : null;
    return tile(def.label, fmt[def.f](v), [delta(v, pv, def.better), h('span', { class: 'vs' }, 'vs anterior')]);
  }

  function statusEl(status) {
    const [label, tone] = STATUS[status] || [status ? String(status).toLowerCase().replace(/_/g, ' ') : '—', 'idle'];
    return h('span', { class: 'status' }, h('span', { class: `status-dot ${tone}` }), label);
  }

  function card(title, sub, body, tools) {
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', null, title), sub ? h('div', { class: 'sub' }, sub) : null), tools ? h('div', { class: 'card-tools' }, tools) : null),
      body,
    );
  }

  function segmented(options, value, onChange, label) {
    return h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': label },
      options.map(([key, text]) =>
        h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(key === value), onclick: () => onChange(key) }, text),
      ),
    );
  }

  function sectionTitle(title, sub) {
    return h('div', { class: 'section-title' }, h('h2', null, title), sub ? h('span', null, sub) : null);
  }

  function emptyState(text) {
    return h('p', { class: 'empty' }, text);
  }

  function loadingState(text = 'Carregando…') {
    return h('p', { class: 'empty' }, text);
  }

  function errorState(text) {
    return h('p', { class: 'empty' }, `Não foi possível carregar: ${text}`);
  }

  // Tabela genérica com ordenação opcional.
  function dataTable({ columns, rows, sort, onSort, foot, rowAttrs }) {
    const thead = h(
      'thead',
      null,
      h(
        'tr',
        null,
        columns.map((col) => {
          const active = sort && sort.key === col.key;
          const content =
            col.sortable && onSort
              ? h(
                  'button',
                  { type: 'button', class: 'th-btn', onclick: () => onSort(col.key) },
                  col.label,
                  h('span', { class: 'sort-ind', 'aria-hidden': 'true' }, active ? (sort.dir < 0 ? '▼' : '▲') : ''),
                )
              : col.label;
          return h('th', { class: col.align === 'left' ? 'left' : null, scope: 'col', 'aria-sort': active ? (sort.dir < 0 ? 'descending' : 'ascending') : null }, content);
        }),
      ),
    );
    const tbody = h(
      'tbody',
      null,
      rows.map((row) =>
        h(
          'tr',
          rowAttrs ? rowAttrs(row) : null,
          columns.map((col) => h('td', { class: [col.align === 'left' ? 'left' : '', col.cellClass || ''].join(' ').trim() || null }, col.render(row))),
        ),
      ),
    );
    const tfoot = foot ? h('tfoot', null, h('tr', null, columns.map((col) => h('td', { class: col.align === 'left' ? 'left' : null }, foot[col.key] != null ? foot[col.key] : '')))) : null;
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, thead, tbody, tfoot));
  }

  function shareCell(value, total) {
    const share = total > 0 ? (value / total) * 100 : 0;
    const track = h('span', { class: 'share-track' }, h('span', { style: { width: `${Math.max(0, Math.min(100, share))}%` } }));
    return h('span', { class: 'share' }, track, fmt.pct(share));
  }

  function withSub(main, sub) {
    return [main, sub ? h('span', { class: 'cell-sub' }, sub) : null];
  }

  function downloadCsv(filename, header, rows) {
    const esc = (v) => {
      const str = v == null ? '' : String(v);
      return /[";\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [header.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const csvNum = (v, digits = 2) => (valid(v) ? v.toFixed(digits).replace('.', ',') : '');

  // ====================================================================
  // Abas
  // ====================================================================

  const panels = {
    overview: $('#tab-overview'),
    campaigns: $('#tab-campaigns'),
    creatives: $('#tab-creatives'),
    app: $('#tab-app'),
    audience: $('#tab-audience'),
  };

  function setTab(tab, { push = true } = {}) {
    if (!panels[tab]) tab = 'overview';
    state.tab = tab;
    for (const [key, panel] of Object.entries(panels)) {
      panel.hidden = key !== tab;
      $(`#tabbtn-${key}`).setAttribute('aria-selected', String(key === tab));
      $(`#tabbtn-${key}`).tabIndex = key === tab ? 0 : -1;
    }
    if (push) history.replaceState(null, '', `#${TAB_HASH[tab]}`);
    renderTab();
  }

  function renderTab() {
    hideTip();
    activeCharts = activeCharts.filter((c) => c.container.isConnected && !panels[state.tab].contains(c.container));
    const panel = panels[state.tab];
    if (!state.report) return;
    const scrollY = window.scrollY;
    const builders = { overview: renderOverview, campaigns: renderCampaigns, creatives: renderCreatives, app: renderApp, audience: renderAudience };
    panel.replaceChildren(...[builders[state.tab]()].flat());
    window.scrollTo(0, scrollY);
  }

  // ---------------- Visão geral ----------------

  function resultKeysPresent(report) {
    const keys = new Set([...Object.keys(report.results.current), ...Object.keys(report.results.previous)]);
    return RESULT_ORDER.filter((k) => keys.has(k));
  }

  function renderOverview() {
    const r = state.report;
    const cur = r.totals.current;
    const prev = r.totals.previous;
    const out = [];

    // Hero: investimento
    const avg = cur.spend / r.range.days;
    const hero = h(
      'section',
      { class: 'card hero' },
      h('div', null, h('div', { class: 'hero-label' }, 'Investimento no período'), h('div', { class: 'hero-value' }, fmt.money(cur.spend))),
      h(
        'div',
        { class: 'hero-meta' },
        h('div', null, delta(cur.spend, prev.spend, 0), ' ', h('span', { class: 'vs' }, `vs ${fmt.money(prev.spend)} no período anterior`)),
        h('div', null, `Média de ${fmt.money(avg)} por dia · ${r.range.days} ${r.range.days === 1 ? 'dia' : 'dias'}`),
      ),
    );
    const tiles = h(
      'div',
      { class: 'tiles' },
      ['impressions', 'reach', 'frequency', 'link_clicks', 'ctr', 'cpc', 'cpm'].map((k) => metricTile(k, cur, prev)),
    );
    out.push(h('div', { class: 'grid-hero' }, hero, tiles));

    // Resultados por objetivo
    const keys = resultKeysPresent(r);
    if (keys.length) {
      out.push(sectionTitle('Resultados por objetivo', 'cada campanha conta o resultado da sua meta de otimização'));
      out.push(
        h(
          'div',
          { class: 'tiles wide' },
          keys.map((key) => {
            const c = r.results.current[key] || { value: 0, spend: 0 };
            const p = r.results.previous[key] || { value: 0, spend: 0 };
            const cost = div(c.spend, c.value);
            const pcost = div(p.spend, p.value);
            return tile(RESULT_TYPES[key] ? RESULT_TYPES[key].label : key, fmt.int(c.value), [
              delta(c.value, p.value, 1),
              h('span', null, `${RESULT_TYPES[key] ? RESULT_TYPES[key].cost : 'Custo'}: `, h('strong', null, fmt.money(cost))),
              delta(cost, pcost, -1),
            ]);
          }),
        ),
      );
    }

    // Evolução diária
    out.push(renderDailyCard(r, keys));

    // Distribuição + conta
    out.push(h('div', { class: 'grid-2-1' }, renderSpendSplit(r), renderAccountCard(r)));

    // Todas as ações
    out.push(renderActionsCard(r));
    return out;
  }

  function dailyOptions(r, keys) {
    const opts = [
      ['spend', 'Investimento'],
      ['impressions', 'Impressões'],
      ['link_clicks', 'Cliques no link'],
    ];
    for (const key of keys) opts.push([`result:${key}`, resultShort(key)]);
    if (!keys.includes('registration') && r.daily.some((d) => d.registration > 0)) opts.push(['registration', 'Cadastros']);
    opts.push(['ctr', 'CTR'], ['cpc', 'CPC'], ['cpm', 'CPM']);
    return opts;
  }

  function dailySeries(r, metric) {
    if (metric.startsWith('result:')) {
      const key = metric.slice(7);
      return { values: r.daily.map((d) => (d.results && d.results[key]) || 0), f: 'int', axis: 'int', name: resultShort(key), kind: 'col' };
    }
    if (metric === 'registration') return { values: r.daily.map((d) => d.registration || 0), f: 'int', axis: 'int', name: 'Cadastros', kind: 'col' };
    const def = METRICS[metric];
    return { values: r.daily.map((d) => def.get(d)), f: def.f === 'compact' ? 'int' : def.f, axis: def.axis, name: def.label, kind: def.rate ? 'line' : 'col' };
  }

  function renderDailyCard(r, keys) {
    const opts = dailyOptions(r, keys);
    if (!opts.some(([k]) => k === state.dailyMetric)) state.dailyMetric = 'spend';
    const series = dailySeries(r, state.dailyMetric);
    const labels = r.daily.map((d) => dayShort(d.date));
    const titles = r.daily.map((d) => dayLong(d.date));
    const tools = [
      segmented(opts, state.dailyMetric, (k) => {
        state.dailyMetric = k;
        renderTab();
      }, 'Métrica do gráfico diário'),
      h(
        'button',
        { type: 'button', class: 'btn', 'aria-pressed': String(state.dailyTable), onclick: () => { state.dailyTable = !state.dailyTable; renderTab(); } },
        state.dailyTable ? 'Ver gráfico' : 'Ver tabela',
      ),
    ];
    let body;
    if (state.dailyTable) {
      const resultCols = keys.map((key) => ({ key: `r_${key}`, label: resultShort(key), render: (d) => fmt.int((d.results && d.results[key]) || 0) }));
      body = dataTable({
        columns: [
          { key: 'date', label: 'Dia', align: 'left', render: (d) => dayLong(d.date) },
          { key: 'spend', label: 'Investimento', render: (d) => fmt.money(d.spend) },
          { key: 'impressions', label: 'Impressões', render: (d) => fmt.int(d.impressions) },
          { key: 'link_clicks', label: 'Cliques no link', render: (d) => fmt.int(d.link_clicks) },
          { key: 'ctr', label: 'CTR', render: (d) => fmt.pct(METRICS.ctr.get(d)) },
          { key: 'cpc', label: 'CPC', render: (d) => fmt.money(METRICS.cpc.get(d)) },
          { key: 'cpm', label: 'CPM', render: (d) => fmt.money(METRICS.cpm.get(d)) },
          ...resultCols,
        ],
        rows: [...r.daily].reverse(),
      });
    } else {
      body = h('div', { class: 'chart' });
      const draw = series.kind === 'line' ? lineChart : columnChart;
      mountChart(body, (el) => draw(el, { labels, titles, values: series.values, format: fmt[series.f], axis: axisFmt[series.axis], name: series.name }));
    }
    return card('Evolução diária', `${series.name} por dia`, body, tools);
  }

  function renderSpendSplit(r) {
    const withSpend = r.campaigns.filter((c) => c.metrics && c.metrics.spend > 0).sort((a, b) => b.metrics.spend - a.metrics.spend);
    const total = sum(withSpend, (c) => c.metrics.spend);
    if (!withSpend.length) return card('Distribuição do investimento', 'por campanha', emptyState('Sem investimento no período.'));
    const top = withSpend.slice(0, 5);
    const rest = withSpend.slice(5);
    const used = new Set();
    const parts = top.map((c) => {
      const cls = slotFor(c.id, used);
      used.add(cls);
      return { id: c.id, name: c.name, value: c.metrics.spend, cls };
    });
    if (rest.length) parts.push({ id: 'other', name: `Outras ${rest.length} campanhas`, value: sum(rest, (c) => c.metrics.spend), cls: 'other' });

    const bar = h('div', { class: 'segbar', role: 'img', 'aria-label': parts.map((p) => `${p.name}: ${fmt.money(p.value)} (${fmt.pct((p.value / total) * 100)})`).join('; ') });
    for (const p of parts) {
      const share = (p.value / total) * 100;
      const el = h('div', {
        class: `segbar-part bg-${p.cls}${p.cls === 's4' ? ' ink-dark' : ''}`,
        tabindex: 0,
        'aria-label': `${p.name}: ${fmt.money(p.value)}, ${fmt.pct(share)}`,
        style: { flexGrow: String(p.value) },
      });
      el.dataset.label = `${nf({ maximumFractionDigits: 0 }).format(share)}%`;
      const enter = (evt) => showTip(evt.clientX != null ? evt : el, p.name, [{ value: fmt.money(p.value), label: fmt.pct(share), cls: p.cls }]);
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointermove', enter);
      el.addEventListener('pointerleave', hideTip);
      el.addEventListener('focus', () => enter({}));
      el.addEventListener('blur', hideTip);
      bar.append(el);
    }
    // Rótulos internos apenas quando cabem (medido após o layout).
    mountChart(bar, (container) => {
      for (const el of container.children) {
        const label = el.dataset.label;
        el.textContent = el.clientWidth > textWidth(label, 12) + 16 ? label : '';
      }
    });

    const legend = h(
      'div',
      { class: 'legend stack' },
      parts.map((p) =>
        h(
          'div',
          { class: 'legend-item' },
          h('span', { class: 'legend-left' }, h('span', { class: `legend-swatch bg-${p.cls}` }), h('span', { class: 'legend-name', title: p.name }, p.name)),
          h('strong', null, fmt.money(p.value)),
        ),
      ),
    );
    return card('Distribuição do investimento', `por campanha · ${withSpend.length} com veiculação`, [bar, legend]);
  }

  function renderAccountCard(r) {
    const a = r.account;
    const tone = a.status_code === 1 ? 'good' : [2, 101].includes(a.status_code) ? 'critical' : 'warning';
    const rows = [
      ['Conta', a.name || a.id],
      ['ID', `act_${a.id}`],
      a.business_name ? ['Empresa', a.business_name] : null,
      ['Status', h('span', { class: 'status' }, h('span', { class: `status-dot ${tone}` }), a.status_label)],
      ['Moeda', a.currency],
      ['Fuso horário', a.timezone || '—'],
      ['Gasto total (histórico)', fmt.money(a.amount_spent)],
      a.balance ? ['Saldo a pagar', fmt.money(a.balance)] : null,
      a.spend_cap ? ['Limite de gastos', fmt.money(a.spend_cap)] : null,
      ['Campanhas ativas', fmt.int(r.campaigns.filter((c) => c.effective_status === 'ACTIVE').length)],
    ].filter(Boolean);
    return card('Conta de anúncios', 'Meta Ads', h('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
  }

  function renderActionsCard(r) {
    const cur = r.totals.current.actions || {};
    const prev = r.totals.previous.actions || {};
    const spend = r.totals.current.spend;
    const types = Object.keys(cur).filter((t) => !HIDDEN_ACTION_PREFIXES.some((p) => t.startsWith(p)) && cur[t] > 0);
    types.sort((a, b) => cur[b] - cur[a]);
    if (!types.length) return card('Todas as ações', 'registradas pela Meta no período', emptyState('Nenhuma ação registrada no período.'));
    const body = dataTable({
      columns: [
        { key: 'label', label: 'Ação', align: 'left', render: (t) => withSub(actionLabel(t), t) },
        { key: 'value', label: 'Quantidade', render: (t) => fmt.int(cur[t]) },
        { key: 'cost', label: 'Custo por ação', render: (t) => fmt.money(div(spend, cur[t])) },
        { key: 'delta', label: 'vs anterior', render: (t) => delta(cur[t], prev[t] || 0, 1) },
      ],
      rows: types,
    });
    return card('Todas as ações', 'registradas pela Meta no período (custo = investimento total ÷ ações)', body);
  }

  // ---------------- Campanhas ----------------

  const CAMPAIGN_SORTS = {
    name: (c) => c.name.toLowerCase(),
    budget: (c) => c.daily_budget || c.lifetime_budget || 0,
    spend: (c) => (c.metrics ? c.metrics.spend : -1),
    impressions: (c) => (c.metrics ? c.metrics.impressions : -1),
    reach: (c) => (c.metrics ? c.metrics.reach : -1),
    frequency: (c) => (c.metrics ? c.metrics.frequency : -1),
    link_clicks: (c) => (c.metrics ? c.metrics.link_clicks : -1),
    ctr: (c) => (c.metrics ? METRICS.ctr.get(c.metrics) : null) ?? -1,
    cpc: (c) => (c.metrics ? METRICS.cpc.get(c.metrics) : null) ?? Infinity,
    cpm: (c) => (c.metrics ? METRICS.cpm.get(c.metrics) : null) ?? Infinity,
    result: (c) => c.result || 0,
    cpr: (c) => (c.metrics ? div(c.metrics.spend, c.result) : null) ?? Infinity,
  };

  function filteredCampaigns(r) {
    const q = state.campSearch.trim().toLowerCase();
    let list = r.campaigns;
    if (state.campFilter === 'delivery') list = list.filter((c) => c.metrics && (c.metrics.impressions > 0 || c.metrics.spend > 0));
    else if (state.campFilter === 'active') list = list.filter((c) => c.effective_status === 'ACTIVE');
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    const getter = CAMPAIGN_SORTS[state.campSort.key] || CAMPAIGN_SORTS.spend;
    const dir = state.campSort.dir;
    return [...list].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  }

  function budgetText(entity) {
    if (entity.daily_budget) return withSub(fmt.money(entity.daily_budget), entity.budget_level === 'adset' ? 'por dia · conjuntos' : 'por dia');
    if (entity.lifetime_budget) return withSub(fmt.money(entity.lifetime_budget), 'total');
    return '—';
  }

  function metricCells(prefix = '') {
    const m = (row) => row.metrics || {};
    return [
      { key: 'spend', label: 'Investimento', sortable: true, render: (row) => (row.metrics ? fmt.money(row.metrics.spend) : '—') },
      { key: 'impressions', label: 'Impressões', sortable: true, render: (row) => (row.metrics ? fmt.int(row.metrics.impressions) : '—') },
      { key: 'reach', label: 'Alcance', sortable: true, render: (row) => (row.metrics ? fmt.int(row.metrics.reach) : '—') },
      { key: 'frequency', label: 'Freq.', sortable: true, render: (row) => (row.metrics ? fmt.dec(row.metrics.frequency) : '—') },
      { key: 'link_clicks', label: 'Cliques', sortable: true, render: (row) => (row.metrics ? fmt.int(m(row).link_clicks) : '—') },
      { key: 'ctr', label: 'CTR', sortable: true, render: (row) => (row.metrics ? fmt.pct(METRICS.ctr.get(m(row))) : '—') },
      { key: 'cpc', label: 'CPC', sortable: true, render: (row) => (row.metrics ? fmt.money(METRICS.cpc.get(m(row))) : '—') },
      { key: 'cpm', label: 'CPM', sortable: true, render: (row) => (row.metrics ? fmt.money(METRICS.cpm.get(m(row))) : '—') },
      { key: 'result', label: 'Resultados', sortable: true, render: (row) => withSub(row.metrics ? fmt.int(row.result) : '—', resultShort(row.result_key)) },
      { key: 'cpr', label: 'Custo/result.', sortable: true, render: (row) => (row.metrics ? fmt.money(div(row.metrics.spend, row.result)) : '—') },
    ].map((c) => ({ ...c, key: prefix + c.key }));
  }

  function renderCampaigns() {
    const r = state.report;
    const list = filteredCampaigns(r);
    const adsetsByCampaign = new Map();
    for (const a of r.adsets) {
      if (!adsetsByCampaign.has(a.campaign_id)) adsetsByCampaign.set(a.campaign_id, []);
      adsetsByCampaign.get(a.campaign_id).push(a);
    }

    const search = h('input', {
      type: 'search',
      class: 'search',
      placeholder: 'Buscar campanha…',
      value: state.campSearch,
      'aria-label': 'Buscar campanha',
    });
    search.addEventListener('input', () => {
      state.campSearch = search.value;
      const pos = search.selectionStart;
      renderTab();
      const again = $('#tab-campaigns input[type=search]');
      if (again) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    });

    const toolbar = h(
      'div',
      { class: 'toolbar' },
      segmented(
        [
          ['delivery', 'Com veiculação'],
          ['active', 'Ativas'],
          ['all', 'Todas'],
        ],
        state.campFilter,
        (k) => {
          state.campFilter = k;
          renderTab();
        },
        'Filtro de campanhas',
      ),
      h('div', { class: 'grow' }, search),
      h('button', { type: 'button', class: 'btn', onclick: () => exportCampaigns(list) }, 'Exportar CSV'),
    );

    const columns = [
      {
        key: 'name',
        label: 'Campanha',
        align: 'left',
        sortable: true,
        cellClass: 'name-cell',
        render: (c) => {
          if (c.__child) {
            return h(
              'div',
              null,
              h('div', { class: 'name' }, c.name),
              h('div', { class: 'meta' }, statusEl(c.effective_status), h('span', null, `Otimização: ${resultShort(c.result_key)}`)),
            );
          }
          const sets = adsetsByCampaign.get(c.id) || [];
          const open = state.expanded.has(c.id);
          const expander = sets.length
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'expander',
                  'aria-expanded': String(open),
                  'aria-label': `${open ? 'Ocultar' : 'Mostrar'} conjuntos de anúncios de ${c.name}`,
                  onclick: () => {
                    if (open) state.expanded.delete(c.id);
                    else state.expanded.add(c.id);
                    renderTab();
                  },
                },
                h('span', { 'aria-hidden': 'true' }, '›'),
              )
            : h('span', { class: 'expander', 'aria-hidden': 'true' });
          return h(
            'div',
            { class: 'name-row' },
            expander,
            h(
              'div',
              null,
              h('div', { class: 'name' }, c.name),
              h(
                'div',
                { class: 'meta' },
                statusEl(c.effective_status),
                h('span', { class: 'badge' }, OBJECTIVES[c.objective] || c.objective || '—'),
                sets.length ? h('span', null, `${sets.length} ${sets.length === 1 ? 'conjunto' : 'conjuntos'}`) : null,
              ),
            ),
          );
        },
      },
      { key: 'budget', label: 'Orçamento', sortable: true, render: (c) => budgetText(c) },
      ...metricCells(),
    ];

    const rows = [];
    for (const c of list) {
      rows.push(c);
      if (state.expanded.has(c.id)) {
        const sets = (adsetsByCampaign.get(c.id) || []).slice().sort((a, b) => (b.metrics ? b.metrics.spend : -1) - (a.metrics ? a.metrics.spend : -1));
        for (const s2 of sets) rows.push({ ...s2, __child: true });
      }
    }

    const withMetrics = list.filter((c) => c.metrics);
    const tot = {
      spend: sum(withMetrics, (c) => c.metrics.spend),
      impressions: sum(withMetrics, (c) => c.metrics.impressions),
      link_clicks: sum(withMetrics, (c) => c.metrics.link_clicks),
    };
    const foot = list.length
      ? {
          name: `Total (${list.length} ${list.length === 1 ? 'campanha' : 'campanhas'})`,
          spend: fmt.money(tot.spend),
          impressions: fmt.int(tot.impressions),
          link_clicks: fmt.int(tot.link_clicks),
          ctr: fmt.pct(METRICS.ctr.get(tot)),
          cpc: fmt.money(METRICS.cpc.get(tot)),
          cpm: fmt.money(METRICS.cpm.get(tot)),
        }
      : null;

    const table = list.length
      ? dataTable({
          columns,
          rows,
          sort: state.campSort,
          onSort: (key) => {
            state.campSort = state.campSort.key === key ? { key, dir: -state.campSort.dir } : { key, dir: key === 'name' ? 1 : -1 };
            renderTab();
          },
          foot,
          rowAttrs: (row) => (row.__child ? { class: 'child' } : null),
        })
      : emptyState(state.campFilter === 'delivery' ? 'Nenhuma campanha com veiculação no período.' : 'Nenhuma campanha encontrada.');

    return [
      toolbar,
      card(
        'Campanhas',
        'Clique na seta para ver os conjuntos de anúncios. Resultados seguem a meta de otimização de cada campanha.',
        [table, h('p', { class: 'note' }, 'Alcance e frequência não são somados no total porque a mesma pessoa pode ser alcançada por várias campanhas.')],
      ),
    ];
  }

  function exportCampaigns(list) {
    const header = ['Campanha', 'ID', 'Status', 'Objetivo', 'Orçamento diário', 'Investimento', 'Impressões', 'Alcance', 'Frequência', 'Cliques no link', 'CTR (%)', 'CPC', 'CPM', 'Tipo de resultado', 'Resultados', 'Custo por resultado'];
    const rows = list.map((c) => {
      const m = c.metrics || {};
      return [
        c.name,
        c.id,
        (STATUS[c.effective_status] || [c.effective_status])[0],
        OBJECTIVES[c.objective] || c.objective,
        csvNum(c.daily_budget),
        csvNum(m.spend),
        m.impressions ?? '',
        m.reach ?? '',
        csvNum(m.frequency),
        m.link_clicks ?? '',
        csvNum(c.metrics ? METRICS.ctr.get(m) : null),
        csvNum(c.metrics ? METRICS.cpc.get(m) : null),
        csvNum(c.metrics ? METRICS.cpm.get(m) : null),
        resultShort(c.result_key),
        c.metrics ? c.result : '',
        csvNum(c.metrics ? div(m.spend, c.result) : null),
      ];
    });
    downloadCsv(`the-edit-campanhas_${state.since}_${state.until}.csv`, header, rows);
  }

  // ---------------- Criativos ----------------

  const AD_SORTS = {
    spend: ['Maior investimento', (a) => -a.metrics.spend],
    result: ['Mais resultados', (a) => -a.result],
    cpr: ['Menor custo por resultado', (a) => (a.result > 0 ? a.metrics.spend / a.result : Infinity)],
    ctr: ['Maior CTR', (a) => -(METRICS.ctr.get(a.metrics) || 0)],
    impressions: ['Mais impressões', (a) => -a.metrics.impressions],
  };

  function renderCreatives() {
    const r = state.report;
    const entry = lazy('ads', '/api/ads', {});
    const scopeOptions = [h('option', { value: 'all' }, 'Todas as campanhas')];
    if (r.app.campaign_ids.length) scopeOptions.push(h('option', { value: 'app' }, 'Campanhas de app'));
    for (const c of r.campaigns.filter((x) => x.metrics && x.metrics.impressions > 0)) scopeOptions.push(h('option', { value: c.id }, c.name));
    const scopeSel = h('select', { class: 'control', 'aria-label': 'Filtrar por campanha' }, scopeOptions);
    scopeSel.value = state.adsScope;
    if (scopeSel.value !== state.adsScope) {
      state.adsScope = 'all';
      scopeSel.value = 'all';
    }
    scopeSel.addEventListener('change', () => {
      state.adsScope = scopeSel.value;
      renderTab();
    });
    const sortSel = h('select', { class: 'control', 'aria-label': 'Ordenar criativos' }, Object.entries(AD_SORTS).map(([k, [label]]) => h('option', { value: k }, label)));
    sortSel.value = state.adsSort;
    sortSel.addEventListener('change', () => {
      state.adsSort = sortSel.value;
      renderTab();
    });
    const toolbar = h('div', { class: 'toolbar' }, h('label', { class: 'field' }, h('span', null, 'Campanha'), scopeSel), h('label', { class: 'field' }, h('span', null, 'Ordenar por'), sortSel));

    if (entry.status === 'loading') return [toolbar, loadingState('Carregando criativos…')];
    if (entry.status === 'error') return [toolbar, errorState(entry.error)];

    let ads = entry.data.ads;
    if (state.adsScope === 'app') ads = ads.filter((a) => a.is_app);
    else if (state.adsScope !== 'all') ads = ads.filter((a) => a.campaign_id === state.adsScope);
    const sorter = (AD_SORTS[state.adsSort] || AD_SORTS.spend)[1];
    ads = [...ads].sort((a, b) => sorter(a) - sorter(b));

    const warnings = (entry.data.warnings || []).map((w) => h('p', { class: 'note' }, w));
    if (!ads.length) return [toolbar, ...warnings, emptyState('Nenhum anúncio com veiculação no período.')];

    const grid = h(
      'div',
      { class: 'ads-grid' },
      ads.map((ad, i) => {
        const m = ad.metrics;
        const thumb = h('div', { class: 'ad-thumb' });
        if (ad.creative.thumbnail) {
          const img = h('img', { src: ad.creative.thumbnail, alt: `Criativo: ${ad.name}`, loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
          img.addEventListener('error', () => img.replaceWith(document.createTextNode('Prévia indisponível')));
          thumb.append(img);
        } else thumb.append('Prévia indisponível');
        if (ad.effective_status) thumb.append(statusEl(ad.effective_status));
        thumb.append(h('span', { class: 'rank' }, `#${i + 1}`));
        const cpr = div(m.spend, ad.result);
        return h(
          'article',
          { class: 'ad-card' },
          thumb,
          h(
            'div',
            { class: 'ad-body' },
            h('div', null, h('div', { class: 'ad-name', title: ad.name }, ad.name), h('div', { class: 'ad-path', title: `${ad.campaign_name} › ${ad.adset_name}` }, `${ad.campaign_name} › ${ad.adset_name}`)),
            h(
              'dl',
              { class: 'ad-metrics' },
              [
                ['Invest.', fmt.money(m.spend)],
                [resultShort(ad.result_key), fmt.int(ad.result)],
                ['Custo/res.', fmt.money(cpr)],
                ['CTR', fmt.pct(METRICS.ctr.get(m))],
                ['CPC', fmt.money(METRICS.cpc.get(m))],
                ['Impressões', fmt.compact(m.impressions)],
              ].map(([k, v]) => h('div', null, h('dt', { title: k }, k), h('dd', null, v))),
            ),
            ad.creative.permalink ? h('a', { class: 'ad-link', href: ad.creative.permalink, target: '_blank', rel: 'noopener noreferrer' }, 'Ver publicação ↗') : null,
          ),
        );
      }),
    );
    const total = entry.data.total_ads;
    const note = h('p', { class: 'note' }, `${ads.length} ${ads.length === 1 ? 'anúncio' : 'anúncios'} exibidos${total > entry.data.ads.length ? ` (os ${entry.data.ads.length} de maior investimento entre ${total})` : ''}.`);
    return [toolbar, ...warnings, grid, note];
  }

  // ---------------- App ----------------

  function renderApp() {
    const r = state.report;
    const app = r.app;
    const cur = app.current;
    const prev = app.previous;
    if (!app.campaign_ids.length) {
      return card('App', null, emptyState('Nenhuma campanha de promoção do app encontrada nesta conta.'));
    }
    const out = [];
    const regKey = cur.app_registration > 0 || prev.app_registration > 0 ? 'app_registration' : 'registration';
    const reg = cur[regKey];
    const pReg = prev[regKey];

    const stores = (app.stores || []).filter((st) => st.object_store_url);
    const storeLinks = stores.map((st) =>
      h('a', { class: 'btn', href: st.object_store_url, target: '_blank', rel: 'noopener noreferrer' }, /apple\.com/.test(st.object_store_url) ? 'Abrir na App Store ↗' : /google\.com/.test(st.object_store_url) ? 'Abrir no Google Play ↗' : 'Abrir loja ↗'),
    );
    out.push(
      card(
        'App The Edit',
        'Eventos do app medidos pelo SDK da Meta e atribuídos às campanhas de promoção do app.',
        h(
          'div',
          { class: 'tiles flat cols-4' },
          tile('Investimento em app', fmt.money(cur.spend), [delta(cur.spend, prev.spend, 0), h('span', { class: 'vs' }, 'vs anterior')]),
          tile('Instalações', fmt.int(cur.install), [delta(cur.install, prev.install, 1), h('span', { class: 'vs' }, 'vs anterior')]),
          tile('Custo por instalação', fmt.money(div(cur.spend, cur.install)), [delta(div(cur.spend, cur.install), div(prev.spend, prev.install), -1), h('span', { class: 'vs' }, 'vs anterior')]),
          tile('Cadastros no app', fmt.int(reg), [delta(reg, pReg, 1), h('span', { class: 'vs' }, 'vs anterior')]),
          tile('Custo por cadastro', fmt.money(div(cur.spend, reg)), [delta(div(cur.spend, reg), div(prev.spend, pReg), -1), h('span', { class: 'vs' }, 'vs anterior')]),
          tile('Instalação → cadastro', fmt.pct(cur.install ? (reg / cur.install) * 100 : null), [
            delta(cur.install ? (reg / cur.install) * 100 : null, prev.install ? (pReg / prev.install) * 100 : null, 1, { absolute: true }),
          ]),
          tile('Cliques para a loja', fmt.int(cur.link_clicks), [delta(cur.link_clicks, prev.link_clicks, 1), h('span', { class: 'vs' }, 'vs anterior')]),
          tile('CTR (link)', fmt.pct(METRICS.ctr.get(cur)), [delta(METRICS.ctr.get(cur), METRICS.ctr.get(prev), 1), h('span', { class: 'vs' }, 'vs anterior')]),
        ),
        storeLinks.length ? storeLinks : null,
      ),
    );

    // Funil
    const steps = [
      ['Impressões', cur.impressions],
      ['Cliques para a loja', cur.link_clicks],
      ['Instalações', cur.install],
      ['Cadastros', reg],
    ];
    const funnel = h(
      'div',
      { class: 'funnel' },
      steps.map(([label, value], i) => {
        const prevValue = i > 0 ? steps[i - 1][1] : null;
        const rate = i > 0 ? div(value, prevValue) : null;
        const ofTotal = div(value, steps[0][1]);
        return h(
          'div',
          { class: 'funnel-step' },
          h('div', { class: 'funnel-label' }, label),
          h('div', { class: 'funnel-value' }, fmt.int(value)),
          h('div', { class: 'funnel-rate' }, i === 0 ? 'Topo do funil' : [h('strong', null, fmt.pct(rate == null ? null : rate * 100)), ' da etapa anterior']),
          h('div', { class: 'funnel-meter', role: 'presentation' }, h('span', { style: { width: `${i === 0 ? 100 : Math.max(rate ? rate * 100 : 0, value > 0 ? 2 : 0)}%` } })),
          i > 0 ? h('div', { class: 'funnel-rate small' }, `${fmt.pct(ofTotal == null ? null : ofTotal * 100)} das impressões`) : null,
        );
      }),
    );
    out.push(card('Funil do app', 'A barra mostra a conversão em relação à etapa anterior.', funnel));

    // Diário
    const labels = r.daily.map((d) => dayShort(d.date));
    const titles = r.daily.map((d) => dayLong(d.date));
    const instEl = h('div', { class: 'chart' });
    mountChart(instEl, (el) => columnChart(el, { labels, titles, values: r.daily.map((d) => d.app.install), format: fmt.int, axis: axisFmt.int, name: 'Instalações', height: 220 }));
    const cpiEl = h('div', { class: 'chart' });
    mountChart(cpiEl, (el) => lineChart(el, { labels, titles, values: r.daily.map((d) => div(d.app.spend, d.app.install)), format: fmt.money, axis: axisFmt.money, name: 'Custo por instalação', height: 220 }));
    out.push(h('div', { class: 'grid-2' }, card('Instalações por dia', 'campanhas de app', instEl), card('Custo por instalação por dia', 'dias sem instalação ficam em branco', cpiEl)));

    // Eventos do app
    const ev = app.events.current;
    const pev = app.events.previous;
    const types = Object.keys({ ...ev, ...pev }).sort((a, b) => (ev[b] || 0) - (ev[a] || 0));
    const eventsBody = types.length
      ? dataTable({
          columns: [
            { key: 'label', label: 'Evento', align: 'left', render: (t) => withSub(actionLabel(t), t) },
            { key: 'value', label: 'Quantidade', render: (t) => fmt.int(ev[t] || 0) },
            { key: 'cost', label: 'Custo por evento', render: (t) => fmt.money(div(cur.spend, ev[t])) },
            { key: 'rate', label: 'Por instalação', render: (t) => (t === 'mobile_app_install' ? '—' : fmt.dec(div(ev[t] || 0, cur.install))) },
            { key: 'delta', label: 'vs anterior', render: (t) => delta(ev[t] || 0, pev[t] || 0, 1) },
          ],
          rows: types,
        })
      : emptyState('Nenhum evento de app registrado no período.');
    out.push(card('Eventos do app', 'Tudo o que o SDK enviou para a Meta a partir das campanhas de app', eventsBody));

    // Conjuntos de app
    const appIds = new Set(app.campaign_ids);
    const sets = r.adsets.filter((a) => appIds.has(a.campaign_id) && a.metrics).sort((a, b) => b.metrics.spend - a.metrics.spend);
    const campaignName = new Map(r.campaigns.map((c) => [c.id, c.name]));
    const setsBody = sets.length
      ? dataTable({
          columns: [
            { key: 'name', label: 'Conjunto (público)', align: 'left', cellClass: 'name-cell', render: (a) => h('div', null, h('div', { class: 'name' }, a.name), h('div', { class: 'meta' }, statusEl(a.effective_status), h('span', null, campaignName.get(a.campaign_id) || ''))) },
            { key: 'spend', label: 'Investimento', render: (a) => fmt.money(a.metrics.spend) },
            { key: 'impressions', label: 'Impressões', render: (a) => fmt.int(a.metrics.impressions) },
            { key: 'link_clicks', label: 'Cliques', render: (a) => fmt.int(a.metrics.link_clicks) },
            { key: 'ctr', label: 'CTR', render: (a) => fmt.pct(METRICS.ctr.get(a.metrics)) },
            { key: 'install', label: 'Instalações', render: (a) => fmt.int(a.metrics.install) },
            { key: 'cpi', label: 'CPI', render: (a) => fmt.money(div(a.metrics.spend, a.metrics.install)) },
            { key: 'reg', label: 'Cadastros', render: (a) => fmt.int(a.metrics[regKey]) },
          ],
          rows: sets,
        })
      : emptyState('Nenhum conjunto de app com veiculação no período.');
    out.push(card('Públicos das campanhas de app', 'conjuntos de anúncios com veiculação no período', setsBody));

    // Dispositivos
    const dev = lazy('breakdown', '/api/breakdown', { dim: 'device', scope: 'app' }, 'device|app');
    let devBody;
    if (dev.status === 'loading') devBody = loadingState();
    else if (dev.status === 'error') devBody = errorState(dev.error);
    else {
      const rows = dev.data.rows.filter((x) => x.impressions > 0).sort((a, b) => b.spend - a.spend);
      const total = sum(rows, (x) => x.spend);
      devBody = rows.length
        ? dataTable({
            columns: [
              { key: 'device', label: 'Dispositivo', align: 'left', render: (x) => prettify(DEVICES, x.impression_device) },
              { key: 'share', label: 'Parcela do investimento', render: (x) => shareCell(x.spend, total) },
              { key: 'spend', label: 'Investimento', render: (x) => fmt.money(x.spend) },
              { key: 'impressions', label: 'Impressões', render: (x) => fmt.int(x.impressions) },
              { key: 'link_clicks', label: 'Cliques', render: (x) => fmt.int(x.link_clicks) },
              { key: 'install', label: 'Instalações', render: (x) => fmt.int(x.install) },
              { key: 'cpi', label: 'CPI', render: (x) => fmt.money(div(x.spend, x.install)) },
            ],
            rows,
          })
        : emptyState('Sem dados por dispositivo no período.');
    }
    out.push(card('Dispositivos', 'onde os anúncios de app foram exibidos', devBody));
    return out;
  }

  // ---------------- Público ----------------

  function breakdownExtraCols(rows, resultKey) {
    if (resultKey) {
      return [
        { key: 'result', label: resultShort(resultKey), render: (x) => fmt.int(x.result) },
        { key: 'cpr', label: 'Custo/result.', render: (x) => fmt.money(div(x.spend, x.result)) },
      ];
    }
    const cols = [];
    if (rows.some((x) => x.lpv > 0)) cols.push({ key: 'lpv', label: 'Visitas na LP', render: (x) => fmt.int(x.lpv) });
    if (rows.some((x) => x.install > 0)) cols.push({ key: 'install', label: 'Instalações', render: (x) => fmt.int(x.install) });
    return cols;
  }

  function breakdownTable(rows, first, resultKey, limit) {
    const sorted = rows.filter((x) => x.impressions > 0 || x.spend > 0).sort((a, b) => b.spend - a.spend);
    const total = sum(sorted, (x) => x.spend);
    const shown = limit ? sorted.slice(0, limit) : sorted;
    if (!shown.length) return emptyState('Sem dados no período.');
    return [
      dataTable({
        columns: [
          first,
          { key: 'share', label: 'Parcela do investimento', render: (x) => shareCell(x.spend, total) },
          { key: 'spend', label: 'Investimento', render: (x) => fmt.money(x.spend) },
          { key: 'impressions', label: 'Impressões', render: (x) => fmt.int(x.impressions) },
          { key: 'link_clicks', label: 'Cliques', render: (x) => fmt.int(x.link_clicks) },
          { key: 'ctr', label: 'CTR', render: (x) => fmt.pct(METRICS.ctr.get(x)) },
          { key: 'cpc', label: 'CPC', render: (x) => fmt.money(METRICS.cpc.get(x)) },
          ...breakdownExtraCols(sorted, resultKey),
        ],
        rows: shown,
      }),
      limit && sorted.length > limit ? h('p', { class: 'note' }, `Mostrando ${limit} de ${sorted.length}.`) : null,
    ];
  }

  function renderAudience() {
    const r = state.report;
    const scopeOptions = [h('option', { value: 'all' }, 'Todas as campanhas')];
    if (r.app.campaign_ids.length) scopeOptions.push(h('option', { value: 'app' }, 'Campanhas de app'));
    for (const c of r.campaigns.filter((x) => x.metrics && x.metrics.impressions > 0)) scopeOptions.push(h('option', { value: c.id }, c.name));
    const scopeSel = h('select', { class: 'control', 'aria-label': 'Campanhas analisadas' }, scopeOptions);
    scopeSel.value = state.audScope;
    if (scopeSel.value !== state.audScope) {
      state.audScope = 'all';
      scopeSel.value = 'all';
    }
    scopeSel.addEventListener('change', () => {
      state.audScope = scopeSel.value;
      renderTab();
    });
    const toolbar = h('div', { class: 'toolbar' }, h('label', { class: 'field' }, h('span', null, 'Campanhas'), scopeSel));
    const scope = state.audScope;
    const load = (dim) => lazy('breakdown', '/api/breakdown', { dim, scope }, `${dim}|${scope}`);
    const body = (entry, fn) => (entry.status === 'loading' ? loadingState() : entry.status === 'error' ? errorState(entry.error) : fn(entry.data));

    // Idade e gênero
    const ageEntry = load('age_gender');
    const ageCard = body(ageEntry, (data) => {
      const rows = data.rows;
      const metricOpts = [
        ['spend', 'Investimento'],
        ['impressions', 'Impressões'],
        ['link_clicks', 'Cliques no link'],
      ];
      if (data.result_key) metricOpts.push(['result', resultShort(data.result_key)]);
      if (!metricOpts.some(([k]) => k === state.ageMetric)) state.ageMetric = 'spend';
      const metric = state.ageMetric;
      const ages = [...new Set(rows.map((x) => x.age))].filter(Boolean).sort();
      const genders = ['female', 'male', 'unknown'].filter((gd) => rows.some((x) => x.gender === gd && (x.impressions > 0 || x.spend > 0)));
      const value = (age, gender) => sum(rows.filter((x) => x.age === age && x.gender === gender), (x) => x[metric]);
      const clsFor = { female: 's1', male: 's2', unknown: 's3' };
      const series = genders.map((gd) => ({ name: GENDERS[gd], cls: clsFor[gd], values: ages.map((a) => value(a, gd)) }));
      const isMoney = metric === 'spend';
      const chartEl = h('div', { class: 'chart' });
      mountChart(chartEl, (el) => groupedChart(el, { categories: ages, series, format: isMoney ? fmt.money : fmt.int, axis: isMoney ? axisFmt.money : axisFmt.int }));
      const legend = h('div', { class: 'legend' }, series.map((se) => h('span', { class: 'legend-item' }, h('span', { class: `legend-swatch bg-${se.cls}` }), se.name)));
      const byGender = genders.map((gd) => {
        const list = rows.filter((x) => x.gender === gd);
        return { label: GENDERS[gd], spend: sum(list, (x) => x.spend), impressions: sum(list, (x) => x.impressions), link_clicks: sum(list, (x) => x.link_clicks), result: sum(list, (x) => x.result || 0), lpv: sum(list, (x) => x.lpv), install: sum(list, (x) => x.install) };
      });
      const tools = segmented(metricOpts, metric, (k) => {
        state.ageMetric = k;
        renderTab();
      }, 'Métrica por idade e gênero');
      return { tools, content: [legend, chartEl, breakdownTable(byGender, { key: 'label', label: 'Gênero', align: 'left', render: (x) => x.label }, data.result_key)] };
    });
    const ageSection = ageCard && ageCard.content
      ? card('Idade e gênero', 'distribuição por faixa etária', ageCard.content, ageCard.tools)
      : card('Idade e gênero', 'distribuição por faixa etária', ageCard);

    const platformEntry = load('platform');
    const platformCard = card(
      'Plataformas e posicionamentos',
      'onde os anúncios apareceram',
      body(platformEntry, (data) =>
        breakdownTable(
          data.rows,
          { key: 'pos', label: 'Posicionamento', align: 'left', render: (x) => withSub(prettify(POSITIONS, x.platform_position), prettify(PLATFORMS, x.publisher_platform)) },
          data.result_key,
        ),
      ),
    );

    const regionEntry = load('region');
    const regionCard = card(
      'Regiões',
      'estados com mais investimento',
      body(regionEntry, (data) => breakdownTable(data.rows, { key: 'region', label: 'Região', align: 'left', render: (x) => x.region || '—' }, data.result_key, 15)),
    );

    const deviceEntry = load('device');
    const deviceCard = card(
      'Dispositivos',
      'aparelho em que o anúncio foi exibido',
      body(deviceEntry, (data) => breakdownTable(data.rows, { key: 'dev', label: 'Dispositivo', align: 'left', render: (x) => prettify(DEVICES, x.impression_device) }, data.result_key)),
    );

    return [toolbar, ageSection, platformCard, regionCard, deviceCard];
  }

  // ====================================================================
  // Carregamento
  // ====================================================================

  const banner = $('#banner');
  function showBanner(message, kind = 'error') {
    banner.textContent = message;
    banner.classList.toggle('is-warning', kind === 'warning');
    banner.hidden = false;
  }

  const updatedEl = $('#updated');
  const mainEl = $('#main');

  async function loadReport({ refresh = false } = {}) {
    const req = ++state.reportReq;
    mainEl.classList.add('is-loading');
    mainEl.setAttribute('aria-busy', 'true');
    updatedEl.textContent = 'Carregando…';
    banner.hidden = true;
    state.refreshNext = refresh;
    try {
      const report = await api('/api/report', { refresh: refresh ? '1' : null });
      if (req !== state.reportReq) return;
      state.report = report;
      CURRENCY = report.account.currency || 'BRL';
      nfCache.clear();
      state.lazy = new Map();
      $('#account-chip').textContent = `${report.account.name || 'Conta'} · act_${report.account.id}`;
      const at = new Date(report.generated_at);
      updatedEl.textContent = `Dados de ${at.toLocaleDateString('pt-BR')} às ${at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      if (report.account.status_code !== 1) showBanner(`A conta de anúncios está com status "${report.account.status_label}".`, 'warning');
      renderTab();
    } catch (err) {
      if (req !== state.reportReq) return;
      updatedEl.textContent = '';
      showBanner(err.message);
      if (!state.report) panels[state.tab].replaceChildren(emptyState('Não foi possível carregar os dados.'));
    } finally {
      if (req === state.reportReq) {
        mainEl.classList.remove('is-loading');
        mainEl.removeAttribute('aria-busy');
        // as próximas cargas preguiçosas desta rodada também ignoram o cache
        setTimeout(() => {
          state.refreshNext = false;
        }, 0);
      }
    }
  }

  // ====================================================================
  // Filtros
  // ====================================================================

  const presetSel = $('#preset');
  const sinceInput = $('#since');
  const untilInput = $('#until');

  for (const [key, p] of Object.entries(PRESETS)) presetSel.append(h('option', { value: key }, p.label));

  function applyPreset(key) {
    state.preset = key;
    presetSel.value = key;
    if (key !== 'custom') {
      const [a, b] = PRESETS[key].range();
      state.since = toIso(a);
      state.until = toIso(b);
    }
    sinceInput.value = state.since;
    untilInput.value = state.until;
    sinceInput.max = toIso(today());
    untilInput.max = toIso(today());
    store.set('te.preset', key);
    if (key === 'custom') store.set('te.custom', `${state.since}|${state.until}`);
  }

  presetSel.addEventListener('change', () => {
    applyPreset(presetSel.value);
    loadReport();
  });

  function onDateChange() {
    const a = sinceInput.value;
    const b = untilInput.value;
    if (!a || !b) return;
    if (a > b) {
      showBanner('A data inicial precisa ser anterior à final.', 'warning');
      return;
    }
    state.since = a;
    state.until = b;
    applyPreset('custom');
    loadReport();
  }
  sinceInput.addEventListener('change', onDateChange);
  untilInput.addEventListener('change', onDateChange);

  $('#refresh').addEventListener('click', () => {
    if (state.preset !== 'custom') applyPreset(state.preset); // recalcula "hoje"
    loadReport({ refresh: true });
  });

  document.querySelectorAll('.tabs [role=tab]').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
    btn.addEventListener('keydown', (evt) => {
      if (evt.key !== 'ArrowRight' && evt.key !== 'ArrowLeft') return;
      const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
      const i = tabs.indexOf(btn);
      const next = tabs[(i + (evt.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      setTab(next.dataset.tab);
    });
  });

  window.addEventListener('hashchange', () => {
    const tab = HASH_TAB[location.hash.slice(1)];
    if (tab && tab !== state.tab) setTab(tab, { push: false });
  });

  // Tema
  const savedTheme = store.get('te.theme');
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
  $('#theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('te.theme', next);
  });

  // ====================================================================
  // Início
  // ====================================================================

  const savedPreset = store.get('te.preset');
  if (savedPreset === 'custom') {
    const [a, b] = String(store.get('te.custom') || '').split('|');
    if (/^\d{4}-\d{2}-\d{2}$/.test(a || '') && /^\d{4}-\d{2}-\d{2}$/.test(b || '') && a <= b) {
      state.since = a;
      state.until = b;
      applyPreset('custom');
    } else applyPreset('last_30d');
  } else applyPreset(PRESETS[savedPreset] ? savedPreset : 'last_30d');

  setTab(HASH_TAB[location.hash.slice(1)] || 'overview', { push: false });
  loadReport();
})();

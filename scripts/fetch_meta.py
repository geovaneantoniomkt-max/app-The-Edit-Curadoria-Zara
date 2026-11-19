#!/usr/bin/env python3
"""
Coletor de dados do Meta para o dashboard The Edit (mesma base do dashboard Lapidation).

Roda uma vez por marca declarada em public/config.json ("brands") e gera, para cada uma:
  - meta-<id>.json     -> Meta Ads: conta, campanhas, conjuntos, anuncios, serie diaria por anuncio
  - organic-<id>.json  -> Organico: pagina do Facebook e perfil do Instagram (melhor esforco)

Hoje e uma marca:
  theedit   conta 2327717030881984 - pagina The Edit - @the_edit.br

Os eventos do app (instalacao, cadastro, abertura...) chegam pelo SDK da Meta e vem nas linhas
diarias em `actions` (mobile_app_install, app_custom_event.*). O conjunto de promocao do app
guarda o app promovido em `promoted_app` (id e link da loja).

O campo "history_since" da marca corta um passado que nao interessa (ex.: conta herdada de
outro negocio): sem ele, "Desde o inicio" soma tudo desde a primeira campanha da conta.

Uso:
  META_ACCESS_TOKEN=EAAB... python scripts/fetch_meta.py
  META_ACCESS_TOKEN=EAAB... python scripts/fetch_meta.py --brand theedit

Variaveis de ambiente:
  META_ACCESS_TOKEN   (obrigatoria)  token de usuario do sistema / usuario com ads_read,
                                     pages_read_engagement, read_insights, instagram_basic,
                                     instagram_manage_insights, business_management
  META_API_VERSION    (padrao v23.0)
  CONFIG_PATH         (padrao public/config.json)
  OUT_DIR             (padrao public/data)
  SINCE               (opcional, YYYY-MM-DD) forca a data inicial em todas as marcas

Loja (a partir de nov/2026): alem de `actions` (contagens), o coletor pede `action_values`
(valor em reais de cada evento). E de la que saem Receita e ROAS das compras do pixel.
O funil da loja (visualizacao da pagina, produto, carrinho, checkout, pagamento, compra)
ja vinha em `actions`; o painel so passou a ler.

Sem dependencias externas (apenas biblioteca padrao).
O token NUNCA e impresso - mensagens de erro sao higienizadas.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_VERSION = os.environ.get("META_API_VERSION", "v23.0")
TOKEN = os.environ.get("META_ACCESS_TOKEN", "").strip()
CONFIG_PATH = os.environ.get("CONFIG_PATH", "public/config.json")
OUT_DIR = os.environ.get("OUT_DIR", "public/data")
FORCE_SINCE = os.environ.get("SINCE", "").strip()

BASE = f"https://graph.facebook.com/{API_VERSION}"
TOKEN_RE = re.compile(r"access_token=[^&\s]+")

WARNINGS: list[str] = []


def reset_warnings() -> None:
    """Cada marca comeca com a propria lista: aviso de uma conta nao polui a outra."""
    WARNINGS.clear()


# ----------------------------------------------------------------------------
# utilitários
# ----------------------------------------------------------------------------

def log(msg: str) -> None:
    print(TOKEN_RE.sub("access_token=***", str(msg)), flush=True)


def warn(msg: str) -> None:
    msg = TOKEN_RE.sub("access_token=***", str(msg))
    WARNINGS.append(msg)
    log(f"AVISO: {msg}")


class ApiError(Exception):
    def __init__(self, message: str, code=None, subcode=None, http=None):
        super().__init__(message)
        self.code = code
        self.subcode = subcode
        self.http = http

    def __str__(self) -> str:  # nunca inclui a URL (que contém o token)
        return f"{super().__str__()} (code={self.code}, subcode={self.subcode}, http={self.http})"


def api(path: str, params: dict | None = None, token: str | None = None, retries: int = 5) -> dict:
    """GET na Graph API com retry/backoff. Levanta ApiError em erro definitivo."""
    q = dict(params or {})
    q["access_token"] = token or TOKEN
    url = f"{BASE}/{path.lstrip('/')}?{urllib.parse.urlencode(q)}"
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "theedit-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", {})
            except Exception:
                err = {"message": body[:300]}
            code = err.get("code")
            transient = e.code >= 500 or code in (1, 2, 4, 17, 32, 613, 80000, 80004)
            last_err = ApiError(err.get("message", "erro"), code, err.get("error_subcode"), e.code)
            if transient and attempt < retries - 1:
                wait = min(120, 5 * (2 ** attempt))
                log(f"  retry em {wait}s: {last_err}")
                time.sleep(wait)
                continue
            raise last_err
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_err = ApiError(f"rede: {getattr(e, 'reason', e)}")
            if attempt < retries - 1:
                time.sleep(5 * (2 ** attempt))
                continue
            raise last_err
    raise last_err or ApiError("falha desconhecida")


def api_all(path: str, params: dict | None = None, token: str | None = None, max_pages: int = 500) -> list:
    """Segue a paginação (paging.next) e devolve todos os itens de `data`."""
    out: list = []
    q = dict(params or {})
    q.setdefault("limit", 200)
    res = api(path, q, token)
    out.extend(res.get("data", []))
    pages = 1
    while res.get("paging", {}).get("next") and pages < max_pages:
        after = res["paging"].get("cursors", {}).get("after")
        if not after:
            break
        q["after"] = after
        res = api(path, q, token)
        out.extend(res.get("data", []))
        pages += 1
    return out


def money(v) -> float:
    """Orçamentos vêm em centavos (string). Converte para reais."""
    try:
        return round(int(v) / 100.0, 2)
    except (TypeError, ValueError):
        return 0.0


def fnum(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def inum(v, default=0) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def actions_to_dict(items) -> dict:
    d: dict = {}
    for a in items or []:
        t = a.get("action_type")
        if t:
            d[t] = d.get(t, 0) + inum(a.get("value"))
    return d


def values_to_dict(items) -> dict:
    """Como actions_to_dict, mas para `action_values`: valor em reais, com centavos."""
    d: dict = {}
    for a in items or []:
        t = a.get("action_type")
        if t:
            d[t] = round(d.get(t, 0.0) + fnum(a.get("value")), 2)
    return d


def valores(row) -> dict:
    """Valor (R$) por tipo de evento. Na pratica so as compras tem valor: e a Receita."""
    return values_to_dict(row.get("action_values"))


def eventos(row) -> dict:
    """Junta `actions` e `conversions` num dicionário só.

    O Meta separa os dois: `contact_website` (os "Contatos" do Gerenciador) só
    aparece em `conversions`, enquanto `offsite_conversion.fb_pixel_lead` (os
    "Leads no site") vem em `actions`. Pedir só um dos campos perde metade das
    conversões. Onde a mesma chave existir nos dois, `actions` manda — é a
    contagem bruta do evento.
    """
    d = actions_to_dict(row.get("conversions"))
    d.update(actions_to_dict(row.get("actions")))
    return d


def daterange_chunks(since: dt.date, until: dt.date, days: int):
    cur = since
    while cur <= until:
        end = min(until, cur + dt.timedelta(days=days - 1))
        yield cur, end
        cur = end + dt.timedelta(days=1)


def today_in(tz_name: str | None) -> dt.date:
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo(tz_name or "America/Sao_Paulo")).date()
    except Exception:
        return dt.date.today()


# ----------------------------------------------------------------------------
# Meta Ads
# ----------------------------------------------------------------------------

STATUS_FILTER = json.dumps([{
    "field": "effective_status",
    "operator": "IN",
    "value": ["ACTIVE", "PAUSED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "WITH_ISSUES",
              "IN_PROCESS", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO"],
}])

_BASE_INSIGHT = [
    "date_start", "date_stop", "campaign_id", "adset_id", "ad_id",
    "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks",
    "actions", "action_values",
    "video_thruplay_watched_actions", "video_p25_watched_actions", "video_p100_watched_actions",
]
# `conversions` traz os "Contatos" (contact_website), que não existem em `actions`.
# O catálogo da API o documenta no nível campanha; aqui a série é por anúncio, então
# pode ser recusado. Se for, seguimos sem ele — perder os contatos é ruim, perder a
# coleta inteira é muito pior.
INSIGHT_FIELDS = ",".join(_BASE_INSIGHT + ["conversions"])


def campo_recusado(e: "ApiError", campo: str) -> bool:
    """A API reclamou justamente deste campo?"""
    texto = str(e).lower()
    return campo in texto and any(p in texto for p in
                                  ("invalid", "unsupported", "not supported", "unknown", "param"))


def fetch_ads_data(account_id: str, history_since: str | None = None) -> dict:
    acct = f"act_{account_id}"
    log(f"Conta {acct}: dados cadastrais")
    account_raw = api(acct, {"fields": "id,name,account_status,currency,timezone_name,balance,amount_spent,spend_cap,disable_reason"})
    tz = account_raw.get("timezone_name") or "America/Sao_Paulo"
    today = today_in(tz)
    account = {
        "id": account_id,
        "name": account_raw.get("name"),
        "status": account_raw.get("account_status"),
        "disable_reason": account_raw.get("disable_reason"),
        "currency": account_raw.get("currency", "BRL"),
        "timezone": tz,
        "balance": money(account_raw.get("balance")),
        "amount_spent_lifetime": money(account_raw.get("amount_spent")),
        "spend_cap": money(account_raw.get("spend_cap")),
    }

    log("Campanhas")
    campaigns = []
    for c in api_all(f"{acct}/campaigns", {
        "fields": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,start_time,stop_time,bid_strategy,buying_type,updated_time",
        "filtering": STATUS_FILTER,
    }):
        campaigns.append({
            "id": c["id"], "name": c.get("name"), "status": c.get("status"),
            "effective_status": c.get("effective_status"), "objective": c.get("objective"),
            "daily_budget": money(c.get("daily_budget")), "lifetime_budget": money(c.get("lifetime_budget")),
            "created_time": c.get("created_time"), "start_time": c.get("start_time"), "stop_time": c.get("stop_time"),
            "bid_strategy": c.get("bid_strategy"), "buying_type": c.get("buying_type"),
        })

    log("Conjuntos de anúncios")
    adsets = []
    for s in api_all(f"{acct}/adsets", {
        "fields": "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,promoted_object,targeting{age_min,age_max,genders,geo_locations,targeting_automation}",
        "filtering": STATUS_FILTER,
    }):
        tg = s.get("targeting") or {}
        geo = tg.get("geo_locations") or {}
        geo_summary = []
        for key in ("countries", "regions", "cities", "zips", "places", "custom_locations"):
            for g in geo.get(key, []) or []:
                if isinstance(g, dict):
                    geo_summary.append(g.get("name") or g.get("key") or str(g))
                else:
                    geo_summary.append(str(g))
        adsets.append({
            "id": s["id"], "name": s.get("name"), "campaign_id": s.get("campaign_id"),
            "status": s.get("status"), "effective_status": s.get("effective_status"),
            "optimization_goal": s.get("optimization_goal"), "billing_event": s.get("billing_event"),
            "bid_strategy": s.get("bid_strategy"),
            "daily_budget": money(s.get("daily_budget")), "lifetime_budget": money(s.get("lifetime_budget")),
            "start_time": s.get("start_time"), "end_time": s.get("end_time"), "created_time": s.get("created_time"),
            # evento do pixel que o conjunto otimiza (PURCHASE, LEAD, CONTACT...). E o que
            # separa a campanha de venda das de captacao, ja que as duas usam OFFSITE_CONVERSIONS.
            "promoted_event": (s.get("promoted_object") or {}).get("custom_event_type"),
            # app promovido (campanhas de promocao do app): id e link da loja
            "promoted_app": {k: v for k, v in (s.get("promoted_object") or {}).items()
                             if k in ("application_id", "object_store_url")} or None,
            "targeting": {
                "age_min": tg.get("age_min"), "age_max": tg.get("age_max"),
                "genders": tg.get("genders"), "geo": geo_summary[:20],
                "advantage_audience": (tg.get("targeting_automation") or {}).get("advantage_audience"),
            },
        })

    log("Anúncios e criativos")
    ads = []
    creative_fields = "id,name,thumbnail_url,image_url,body,title,object_type,effective_object_story_id,instagram_permalink_url,video_id,call_to_action_type"
    try:
        raw_ads = api_all(f"{acct}/ads", {
            "fields": f"id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,preview_shareable_link,creative.thumbnail_width(600).thumbnail_height(600){{{creative_fields}}}",
            "filtering": STATUS_FILTER,
        })
    except ApiError as e:
        warn(f"anúncios com miniatura grande falhou ({e}); tentando sem parâmetros de miniatura")
        raw_ads = api_all(f"{acct}/ads", {
            "fields": f"id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,preview_shareable_link,creative{{{creative_fields}}}",
            "filtering": STATUS_FILTER,
        })
    for a in raw_ads:
        cr = a.get("creative") or {}
        ads.append({
            "id": a["id"], "name": a.get("name"), "adset_id": a.get("adset_id"), "campaign_id": a.get("campaign_id"),
            "status": a.get("status"), "effective_status": a.get("effective_status"),
            "created_time": a.get("created_time"), "updated_time": a.get("updated_time"),
            "preview_link": a.get("preview_shareable_link"),
            "creative": {
                "id": cr.get("id"), "thumbnail_url": cr.get("thumbnail_url"), "image_url": cr.get("image_url"),
                "body": (cr.get("body") or "")[:400], "title": cr.get("title"), "object_type": cr.get("object_type"),
                "instagram_permalink_url": cr.get("instagram_permalink_url"),
                "video_id": cr.get("video_id"), "cta": cr.get("call_to_action_type"),
            },
        })

    # ---- série diária por anúncio -------------------------------------------------
    created = [c["created_time"][:10] for c in campaigns if c.get("created_time")]
    if FORCE_SINCE:
        since = dt.date.fromisoformat(FORCE_SINCE)
    elif created:
        since = dt.date.fromisoformat(min(created))
    else:
        since = today - dt.timedelta(days=30)
    # piso da marca: corta o historico de um negocio anterior na mesma conta
    floor = dt.date.fromisoformat(history_since) if history_since else None
    if floor:
        since = max(since, floor)
    # limite de segurança: no máximo 37 meses de histórico (limite da API)
    since = max(since, today - dt.timedelta(days=37 * 30))
    until = today
    log(f"Série diária por anúncio: {since} a {until}")

    daily = []
    action_types: set[str] = set()
    campos = INSIGHT_FIELDS
    for a, b in daterange_chunks(since, until, 31):
        def puxa(fields):
            return api_all(f"{acct}/insights", {
                "level": "ad",
                "time_increment": 1,
                "time_range": json.dumps({"since": a.isoformat(), "until": b.isoformat()}),
                "fields": fields,
                "limit": 500,
            })
        try:
            rows = puxa(campos)
        except ApiError as e:
            if "conversions" in campos.split(",") and campo_recusado(e, "conversions"):
                warn("a API recusou `conversions` no nível anúncio; seguindo sem os Contatos. "
                     "Os Leads no site continuam vindo por `actions`.")
                campos = ",".join(c for c in campos.split(",") if c != "conversions")
                rows = puxa(campos)
            elif "action_values" in campos.split(",") and campo_recusado(e, "action_values"):
                # sem a receita o painel perde o ROAS, mas compras e funil seguem vindo por `actions`
                warn("a API recusou `action_values` no nível anúncio; seguindo sem a Receita. "
                     "Compras e funil continuam vindo por `actions`.")
                campos = ",".join(c for c in campos.split(",") if c != "action_values")
                rows = puxa(campos)
            else:
                raise
        for r in rows:
            acts = eventos(r)
            action_types.update(acts.keys())
            daily.append({
                "date": r.get("date_start"),
                "campaign_id": r.get("campaign_id"), "adset_id": r.get("adset_id"), "ad_id": r.get("ad_id"),
                "spend": round(fnum(r.get("spend")), 2),
                "impressions": inum(r.get("impressions")), "reach": inum(r.get("reach")),
                "frequency": round(fnum(r.get("frequency")), 3),
                "clicks": inum(r.get("clicks")), "link_clicks": inum(r.get("inline_link_clicks")),
                "thruplays": sum(inum(x.get("value")) for x in (r.get("video_thruplay_watched_actions") or [])),
                "video_p25": sum(inum(x.get("value")) for x in (r.get("video_p25_watched_actions") or [])),
                "video_p100": sum(inum(x.get("value")) for x in (r.get("video_p100_watched_actions") or [])),
                "actions": acts,
                "values": valores(r),
            })
        log(f"  {a} a {b}: {len(rows)} linhas")

    # ---- totais exatos por preset (alcance/frequência não somam entre dias) -------------
    presets = {}
    for preset in ("last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"):
        try:
            janela = {"date_preset": preset}
            if preset == "maximum" and floor:
                # "maximum" na API e a vida inteira da conta - na Wellness isso traz o Nucleo Casa
                janela = {"time_range": json.dumps({"since": floor.isoformat(), "until": until.isoformat()})}
            res = api(f"{acct}/insights", {
                "level": "account", **janela,
                "fields": "spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values,conversions,date_start,date_stop",
            })
            rows = res.get("data", [])
            if rows:
                r = rows[0]
                presets[preset] = {
                    "since": r.get("date_start"), "until": r.get("date_stop"),
                    "spend": round(fnum(r.get("spend")), 2), "impressions": inum(r.get("impressions")),
                    "reach": inum(r.get("reach")), "frequency": round(fnum(r.get("frequency")), 3),
                    "clicks": inum(r.get("clicks")), "link_clicks": inum(r.get("inline_link_clicks")),
                    "actions": eventos(r),
                    "values": valores(r),
                }
        except ApiError as e:
            warn(f"preset {preset}: {e}")

    # ---- alcance por campanha no período total e nos últimos 7/30 dias -------------
    campaign_reach = {}
    for preset in ("last_7d", "last_30d", "maximum"):
        try:
            janela = {"date_preset": preset}
            if preset == "maximum" and floor:
                janela = {"time_range": json.dumps({"since": floor.isoformat(), "until": until.isoformat()})}
            rows = api_all(f"{acct}/insights", {
                "level": "campaign", **janela,
                "fields": "campaign_id,reach,frequency,spend",
            })
            campaign_reach[preset] = {r["campaign_id"]: {"reach": inum(r.get("reach")), "frequency": round(fnum(r.get("frequency")), 3)} for r in rows}
        except ApiError as e:
            warn(f"alcance por campanha ({preset}): {e}")

    # ---- breakdowns úteis (últimos 30 dias): idade/gênero, região, posicionamento, aparelho --
    # impression_device separa iPhone de Android: na Black de 2026 o custo por clique no
    # iPhone saiu mais que o dobro do Android, e o painel precisa mostrar isso.
    breakdowns = {}
    for name, bd in (("age_gender", "age,gender"), ("region", "region"),
                     ("platform_position", "publisher_platform,platform_position"),
                     ("device", "impression_device")):
        try:
            rows = api_all(f"{acct}/insights", {
                "level": "campaign", "date_preset": "last_30d", "breakdowns": bd,
                "fields": "campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,conversions",
                "limit": 500,
            })
            breakdowns[name] = [{
                "campaign_id": r.get("campaign_id"),
                **{k: r.get(k) for k in bd.split(",")},
                "spend": round(fnum(r.get("spend")), 2), "impressions": inum(r.get("impressions")),
                "reach": inum(r.get("reach")), "clicks": inum(r.get("clicks")),
                "link_clicks": inum(r.get("inline_link_clicks")), "actions": eventos(r),
                "values": valores(r),
            } for r in rows]
        except ApiError as e:
            warn(f"breakdown {name}: {e}")

    # ---- descarta a era anterior da conta ------------------------------------------
    descartadas = 0
    if floor:
        com_dados = {r["campaign_id"] for r in daily if r.get("campaign_id")}
        antes = len(campaigns)
        campaigns = [c for c in campaigns
                     if (c.get("created_time") or "")[:10] >= floor.isoformat() or c["id"] in com_dados]
        vivos = {c["id"] for c in campaigns}
        adsets = [x for x in adsets if x.get("campaign_id") in vivos]
        ads = [x for x in ads if x.get("campaign_id") in vivos]
        descartadas = antes - len(campaigns)
        if descartadas:
            log(f"  {descartadas} campanhas anteriores a {floor} descartadas (era anterior da conta)")

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "api_version": API_VERSION,
        "account": account,
        "history_since": floor.isoformat() if floor else None,
        "dropped_legacy_campaigns": descartadas,
        "range": {"since": since.isoformat(), "until": until.isoformat()},
        "campaigns": campaigns,
        "adsets": adsets,
        "ads": ads,
        "daily": daily,
        "presets": presets,
        "campaign_reach": campaign_reach,
        "breakdowns": breakdowns,
        "action_types_seen": sorted(action_types),
        "warnings": [],
    }


# ----------------------------------------------------------------------------
# Orgânico: Página do Facebook + Instagram
# ----------------------------------------------------------------------------

def fetch_organic(today: dt.date, page_id: str, ig_id: str) -> dict:
    out: dict = {
        "generated_at": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "facebook": None, "instagram": None, "warnings": [],
    }
    since_90 = today - dt.timedelta(days=90)
    since_30 = today - dt.timedelta(days=30)

    # ---------------- Facebook -------------------------------------------------------
    page_token = None
    try:
        p = api(page_id, {"fields": "id,name,fan_count,followers_count,link,picture{url},access_token"})
        page_token = p.get("access_token")
        fb = {
            "id": p.get("id"), "name": p.get("name"), "fans": p.get("fan_count"),
            "followers": p.get("followers_count"), "link": p.get("link"),
            "picture": ((p.get("picture") or {}).get("data") or {}).get("url"),
            "daily": {}, "posts": [],
        }
        # A Meta aposenta metrica de Pagina sem avisar, e o nome velho passa a dar erro 100.
        # Entao cada bloco do painel tem uma lista de candidatos: vale o primeiro que responder,
        # e o resultado e guardado sob a chave que o front-end espera.
        # So entram metricas que o painel realmente desenha - coletar o que ninguem le
        # so gera aviso e gasta chamada.
        CONCEITOS = [
            # A Meta aposentou page_impressions_unique (Alcance) no Graph API v25.0, com prazo
            # final em 15/06/2026. A substituta e page_total_media_view_unique, e ela NAO e
            # equivalente: mede visualizadores unicos de conteudo, nao alcance. O rotulo no
            # painel acompanha essa diferenca de proposito.
            ("page_impressions_unique",
             ["page_total_media_view_unique", "page_impressions_unique",
              "page_posts_impressions_unique", "page_impressions"]),
            ("page_post_engagements",
             ["page_post_engagements", "page_total_actions"]),
            ("page_daily_follows_total",
             ["page_daily_follows_total", "page_fan_adds", "page_follows"]),
            ("page_views_total",
             ["page_views_total", "page_views"]),
        ]
        for chave, candidatos in CONCEITOS:
            recusados = []
            for m in candidatos:
                series = []
                try:
                    for a, b in daterange_chunks(since_90, today, 90):
                        res = api(f"{page_id}/insights", {
                            "metric": m, "period": "day",
                            "since": a.isoformat(), "until": (b + dt.timedelta(days=1)).isoformat(),
                        }, token=page_token, retries=2)
                        for d in res.get("data", []):
                            for v in d.get("values", []):
                                series.append({"date": (v.get("end_time") or "")[:10], "value": inum(v.get("value"))})
                    fb["daily"][chave] = series
                    if m != chave:
                        log(f"  Facebook: '{chave}' saiu do ar, usando '{m}' no lugar")
                    break
                except ApiError:
                    recusados.append(m)
            else:
                out["warnings"].append(
                    f"Facebook: nenhum nome serve para {chave} (tentei {', '.join(recusados)}). "
                    f"A Meta aposentou a metrica; esse bloco fica vazio ate acharmos o nome novo.")
        try:
            posts = api_all(f"{page_id}/published_posts", {
                "fields": "id,message,created_time,permalink_url,full_picture,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)",
                "since": since_90.isoformat(), "limit": 50,
            }, token=page_token, max_pages=3)
            for po in posts:
                fb["posts"].append({
                    "id": po.get("id"), "message": (po.get("message") or "")[:300], "created_time": po.get("created_time"),
                    "permalink": po.get("permalink_url"), "picture": po.get("full_picture"),
                    "shares": inum((po.get("shares") or {}).get("count")),
                    "likes": inum(((po.get("likes") or {}).get("summary") or {}).get("total_count")),
                    "comments": inum(((po.get("comments") or {}).get("summary") or {}).get("total_count")),
                })
        except ApiError as e:
            out["warnings"].append(f"Facebook posts: {e}")
        out["facebook"] = fb
    except ApiError as e:
        out["warnings"].append(f"Facebook página {page_id}: {e}")

    # ---------------- Instagram ------------------------------------------------------
    try:
        ig_tok = page_token or TOKEN
        p = api(ig_id, {"fields": "id,username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website"}, token=ig_tok)
        ig = {
            "id": p.get("id"), "username": p.get("username"), "name": p.get("name"),
            "followers": p.get("followers_count"), "follows": p.get("follows_count"),
            "media_count": p.get("media_count"), "profile_picture_url": p.get("profile_picture_url"),
            "biography": p.get("biography"), "website": p.get("website"),
            "daily": {}, "totals": {}, "media": [],
        }
        # séries diárias (reach e follower_count aceitam period=day)
        for m, span in (("reach", since_90), ("follower_count", since_30)):
            series = []
            try:
                for a, b in daterange_chunks(span, today, 30):
                    res = api(f"{ig_id}/insights", {
                        "metric": m, "period": "day",
                        "since": a.isoformat(), "until": (b + dt.timedelta(days=1)).isoformat(),
                    }, token=ig_tok)
                    for d in res.get("data", []):
                        for v in d.get("values", []):
                            series.append({"date": (v.get("end_time") or "")[:10], "value": inum(v.get("value"))})
                ig["daily"][m] = series
            except ApiError as e:
                out["warnings"].append(f"Instagram métrica {m}: {e}")
        # totais por janela (metric_type=total_value)
        total_metrics = "views,profile_views,accounts_engaged,website_clicks,total_interactions,likes,comments,shares,saves,replies,follows_and_unfollows"
        # 90 dias nao cabe: a Meta limita total_value a 30 dias por chamada,
        # e o painel so usa 7 e 30 de qualquer forma
        for label, span in (("last_7d", 7), ("last_30d", 30)):
            try:
                res = api(f"{ig_id}/insights", {
                    "metric": total_metrics, "period": "day", "metric_type": "total_value",
                    "since": (today - dt.timedelta(days=span)).isoformat(), "until": today.isoformat(),
                }, token=ig_tok)
                ig["totals"][label] = {d.get("name"): inum((d.get("total_value") or {}).get("value")) for d in res.get("data", [])}
            except ApiError as e:
                # tenta um subconjunto mais conservador
                try:
                    res = api(f"{ig_id}/insights", {
                        "metric": "views,profile_views,accounts_engaged,website_clicks,total_interactions", "period": "day", "metric_type": "total_value",
                        "since": (today - dt.timedelta(days=span)).isoformat(), "until": today.isoformat(),
                    }, token=ig_tok)
                    ig["totals"][label] = {d.get("name"): inum((d.get("total_value") or {}).get("value")) for d in res.get("data", [])}
                except ApiError as e2:
                    out["warnings"].append(f"Instagram totais {label}: {e2}")
        # série diária de visitas ao perfil / contas engajadas (30 dias, 1 chamada por dia)
        pv, ae, vw = [], [], []
        for i in range(30, -1, -1):
            d = today - dt.timedelta(days=i)
            try:
                res = api(f"{ig_id}/insights", {
                    "metric": "profile_views,accounts_engaged,views", "period": "day", "metric_type": "total_value",
                    "since": d.isoformat(), "until": d.isoformat(),
                }, token=ig_tok, retries=2)
                vals = {x.get("name"): inum((x.get("total_value") or {}).get("value")) for x in res.get("data", [])}
                pv.append({"date": d.isoformat(), "value": vals.get("profile_views", 0)})
                ae.append({"date": d.isoformat(), "value": vals.get("accounts_engaged", 0)})
                vw.append({"date": d.isoformat(), "value": vals.get("views", 0)})
            except ApiError as e:
                out["warnings"].append(f"Instagram diário {d}: {e}")
                break
        if pv:
            ig["daily"]["profile_views"] = pv
            ig["daily"]["accounts_engaged"] = ae
            ig["daily"]["views"] = vw
        # mídias recentes + insights por mídia
        try:
            medias = api_all(f"{ig_id}/media", {
                "fields": "id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count,is_comment_enabled",
                "limit": 50,
            }, token=ig_tok, max_pages=2)
            for m in medias[:60]:
                item = {
                    "id": m.get("id"), "caption": (m.get("caption") or "")[:220], "media_type": m.get("media_type"),
                    "product_type": m.get("media_product_type"), "timestamp": m.get("timestamp"),
                    "permalink": m.get("permalink"), "thumbnail": m.get("thumbnail_url") or m.get("media_url"),
                    "likes": inum(m.get("like_count")), "comments": inum(m.get("comments_count")),
                    "insights": {},
                }
                candidates = ["reach,saved,shares,views,total_interactions", "reach,saved,views", "reach,saved", "reach"]
                for metric_set in candidates:
                    try:
                        res = api(f"{m['id']}/insights", {"metric": metric_set}, token=ig_tok, retries=1)
                        item["insights"] = {d.get("name"): inum((d.get("values") or [{}])[0].get("value")) for d in res.get("data", [])}
                        break
                    except ApiError:
                        continue
                ig["media"].append(item)
        except ApiError as e:
            out["warnings"].append(f"Instagram mídias: {e}")
        out["instagram"] = ig
    except ApiError as e:
        out["warnings"].append(f"Instagram conta {ig_id}: {e}")

    return out


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------

def carrega_marcas(so: str | None = None) -> list[dict]:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    marcas = cfg.get("brands") or []
    if not marcas:
        raise SystemExit(f"{CONFIG_PATH} nao declara nenhuma marca em 'brands'")
    if so:
        marcas = [b for b in marcas if b.get("id") == so]
        if not marcas:
            raise SystemExit(f"marca '{so}' nao existe em {CONFIG_PATH}")
    for b in marcas:
        m = b.get("meta") or {}
        faltando = [k for k in ("ad_account_id", "page_id", "ig_user_id") if not m.get(k)]
        if faltando:
            raise SystemExit(f"marca '{b.get('id')}' sem {', '.join(faltando)} em {CONFIG_PATH}")
    return marcas


def coleta_marca(brand: dict, out_dir: str) -> tuple[bool, dt.date]:
    """Coleta uma marca. Devolve (deu certo nos anuncios, data final usada)."""
    bid = brand["id"]
    m = brand["meta"]
    reset_warnings()
    log("")
    log("=" * 70)
    log(f"MARCA {bid} - {brand.get('name')} - conta {m['ad_account_id']}")
    log("=" * 70)

    ok_ads = True
    try:
        meta = fetch_ads_data(m["ad_account_id"], m.get("history_since"))
        meta["brand"] = {"id": bid, "name": brand.get("name"), "short": brand.get("short"), "accent": brand.get("accent")}
        meta["warnings"] = list(WARNINGS)
        with open(os.path.join(out_dir, f"meta-{bid}.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
        log(f"meta-{bid}.json: {len(meta['campaigns'])} campanhas, {len(meta['ads'])} anuncios, "
            f"{len(meta['daily'])} linhas diarias")
        today = dt.date.fromisoformat(meta["range"]["until"])
    except Exception as e:  # noqa: BLE001
        log(f"ERRO ao coletar Meta Ads de {bid}: {TOKEN_RE.sub('***', str(e))}")
        # erro de permissao e o caso esperado quando a conta esta em outro portfolio
        codigo = getattr(e, "code", None)
        subcodigo = getattr(e, "subcode", None)
        if codigo in (10, 100, 200, 272, 294) or subcodigo == 33:
            log(f"  O token nao enxerga a conta {m['ad_account_id']}.")
            log("  Quase sempre e porque ela esta num portfolio diferente do usuario do sistema.")
            log("  Saida: Configuracoes do negocio > Contas > Contas de anuncio > Adicionar >")
            log("  Solicitar acesso, compartilhando essa conta com o portfolio do usuario do sistema.")
            log("  Detalhes em DASHBOARD.md secao 4.")
        ok_ads = False
        today = today_in(None)

    try:
        organic = fetch_organic(today, m["page_id"], m["ig_user_id"])
        organic["brand"] = {"id": bid, "name": brand.get("name")}
        with open(os.path.join(out_dir, f"organic-{bid}.json"), "w", encoding="utf-8") as f:
            json.dump(organic, f, ensure_ascii=False, separators=(",", ":"))
        n_ig = len((organic.get("instagram") or {}).get("media", []))
        log(f"organic-{bid}.json: instagram={'ok' if organic.get('instagram') else 'indisponivel'} "
            f"({n_ig} midias), facebook={'ok' if organic.get('facebook') else 'indisponivel'}, "
            f"avisos={len(organic['warnings'])}")
    except Exception as e:  # noqa: BLE001
        log(f"AVISO: organico de {bid} falhou: {TOKEN_RE.sub('***', str(e))}")

    return ok_ads, today


def main() -> int:
    ap = argparse.ArgumentParser(description="Coleta dados do Meta para o dashboard The Edit.")
    ap.add_argument("--brand", help="coleta so esta marca (id em config.json)")
    args = ap.parse_args()

    if not TOKEN:
        log("ERRO: defina META_ACCESS_TOKEN")
        return 2
    os.makedirs(OUT_DIR, exist_ok=True)

    # sanidade do token (nao imprime nada sensivel)
    try:
        me = api("me", {"fields": "id,name"})
        log(f"Token OK (usuario/sistema id {me.get('id')})")
    except ApiError as e:
        log(f"ERRO: token invalido ou expirado: {e}")
        return 3
    try:
        perms = api("me/permissions").get("data", [])
        granted = sorted(p["permission"] for p in perms if p.get("status") == "granted")
        needed = {"ads_read", "pages_read_engagement", "read_insights", "instagram_basic", "instagram_manage_insights"}
        missing = sorted(needed - set(granted))
        if missing:
            log(f"AVISO: permissoes ausentes no token: {', '.join(missing)} "
                f"(dados organicos podem ficar incompletos)")
    except ApiError:
        pass  # tokens de usuario do sistema nem sempre expoem /me/permissions

    marcas = carrega_marcas(args.brand)
    log(f"{len(marcas)} marca(s) a coletar: {', '.join(b['id'] for b in marcas)}")

    resultado: dict[str, bool] = {}
    for brand in marcas:
        # uma marca que falha nao derruba a outra: o dashboard mostra a que deu certo
        try:
            ok_ads, _ = coleta_marca(brand, OUT_DIR)
        except Exception as e:  # noqa: BLE001
            log(f"ERRO inesperado na marca {brand.get('id')}: {TOKEN_RE.sub('***', str(e))}")
            ok_ads = False
        resultado[brand["id"]] = ok_ads

    log("")
    log("-" * 70)
    for bid, ok_ads in resultado.items():
        log(f"{bid}: {'ok' if ok_ads else 'FALHOU'}")
    return 0 if all(resultado.values()) else 1


if __name__ == "__main__":
    sys.exit(main())

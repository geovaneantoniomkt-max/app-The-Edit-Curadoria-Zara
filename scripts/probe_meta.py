#!/usr/bin/env python3
"""Sonda TEMPORÁRIA da Graph API: descobre quais campos/ações a API aceita para a conta.
Imprime só nomes de campos, tipos de ação e proporções — nunca valores absolutos do cliente
(o repositório é público e o log do Actions também)."""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import fetch_meta as fm  # noqa: E402

ACC = "act_2327717030881984"
CAMP_IG = "120242674681220171"   # [TE] VISITAS_IG
today = fm.today_in("America/Sao_Paulo")
maxr = json.dumps({"since": "2023-11-01", "until": today.isoformat()})
last7 = json.dumps({"since": (today - dt.timedelta(days=7)).isoformat(), "until": (today - dt.timedelta(days=1)).isoformat()})

def tenta(nome, path, params):
    try:
        res = fm.api(path, params, retries=2)
        print(f"[ok] {nome}")
        return res
    except Exception as e:  # noqa: BLE001
        print(f"[recusado] {nome}: {str(e)[:220]}")
        return None

def ratio(a, b):
    return "—" if not b else f"{100.0 * a / b:.2f}%"

print("== 1. campo `results` no nível campanha")
r = tenta("results campanha", f"{ACC}/insights", {"level": "campaign", "time_range": maxr, "fields": "campaign_id,results,cost_per_result", "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": [CAMP_IG]}]), "use_unified_attribution_setting": "true"})
if r:
    for row in r.get("data", []):
        print("   chaves:", sorted(row.keys()))
        for it in row.get("results") or []:
            print("   indicator:", it.get("indicator"), "| janelas:", [v.get("attribution_windows") for v in it.get("values", [])])

print("== 2. `results` no nível anúncio com série diária")
r = tenta("results anuncio diario", f"{ACC}/insights", {"level": "ad", "time_increment": 1, "time_range": last7, "fields": "ad_id,results", "limit": 50, "use_unified_attribution_setting": "true"})
if r:
    inds = sorted({it.get("indicator") for row in r.get("data", []) for it in (row.get("results") or [])})
    print("   linhas:", len(r.get("data", [])), "| indicators:", inds)

print("== 3. tipos de ação da campanha de visitas ao perfil (nomes)")
r = tenta("actions campanha IG", f"{ACC}/insights", {"level": "campaign", "time_range": maxr, "fields": "actions,conversions,unique_actions", "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": [CAMP_IG]}]), "use_unified_attribution_setting": "true"})
if r and r.get("data"):
    row = r["data"][0]
    for k in ("actions", "conversions", "unique_actions"):
        print(f"   {k}:", sorted({a.get('action_type') for a in row.get(k) or []}))

print("== 4. campos candidatos (um por vez)")
for campo in ("instagram_profile_follow_v2", "profile_visit_view", "total_profile_visits", "instagram_follows", "instagram_profile_visits", "onsite_conversion.ig_follow"):
    tenta(f"campo {campo}", f"{ACC}/insights", {"level": "campaign", "time_range": maxr, "fields": f"campaign_id,{campo}", "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": [CAMP_IG]}])})

print("== 5. anúncios excluídos/arquivados entram na série por anúncio?")
def soma_spend(params):
    rows = fm.api_all(f"{ACC}/insights", params)
    return sum(fm.fnum(x.get("spend")) for x in rows), len(rows)
try:
    acc = fm.api(f"{ACC}/insights", {"level": "account", "time_range": maxr, "fields": "spend", "use_unified_attribution_setting": "true"}).get("data", [{}])[0]
    conta = fm.fnum(acc.get("spend"))
    s1, n1 = soma_spend({"level": "ad", "time_range": maxr, "fields": "ad_id,spend", "limit": 500})
    todos = ["ACTIVE", "PAUSED", "DELETED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "CAMPAIGN_PAUSED", "ARCHIVED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"]
    s2, n2 = soma_spend({"level": "ad", "time_range": maxr, "fields": "ad_id,spend", "limit": 500, "filtering": json.dumps([{"field": "ad.effective_status", "operator": "IN", "value": todos}])})
    print(f"   sem filtro: {n1} anúncios, {ratio(s1, conta)} do gasto da conta")
    print(f"   com todos os status: {n2} anúncios, {ratio(s2, conta)} do gasto da conta")
except Exception as e:  # noqa: BLE001
    print("   erro:", str(e)[:200])

print("== 6. atribuição unificada muda instalações/resultados?")
for uni in ("false", "true"):
    r = tenta(f"unified={uni}", f"{ACC}/insights", {"level": "account", "time_range": maxr, "fields": "actions", "use_unified_attribution_setting": uni})
    if r and r.get("data"):
        a = fm.actions_to_dict(r["data"][0].get("actions"))
        globals()[f"acts_{uni}"] = a
if "acts_false" in globals() and "acts_true" in globals():
    for k in ("mobile_app_install", "omni_app_install", "link_click", "landing_page_view", "omni_landing_page_view", "post_engagement", "onsite_conversion.messaging_conversation_started_7d"):
        print(f"   {k}: unified/padrão = {ratio(acts_true.get(k, 0), acts_false.get(k, 0))}")

print("== 7. Instagram: métricas de total e seguidores")
cfg = json.load(open("public/config.json", encoding="utf-8"))
ig = cfg["brands"][0]["meta"]["ig_user_id"]
page = cfg["brands"][0]["meta"]["page_id"]
try:
    ptoken = fm.api(page, {"fields": "access_token"}).get("access_token")
except Exception as e:  # noqa: BLE001
    ptoken = None
    print("   token de página indisponível:", str(e)[:160])
since30 = (today - dt.timedelta(days=30)).isoformat()
for metric, extra in (("reach", {}), ("follows_and_unfollows", {"breakdown": "follow_type"}), ("follower_count", {})):
    for mt in ("total_value",):
        r = tenta(f"IG {metric} {mt} {extra}", f"{ig}/insights", {"metric": metric, "period": "day", "metric_type": mt, "since": since30, "until": today.isoformat(), **extra}) if True else None
        if r:
            for d in r.get("data", []):
                tv = d.get("total_value") or {}
                print("   chaves total_value:", sorted(tv.keys()), "| breakdowns:", [b.get("dimension_keys") for b in tv.get("breakdowns", [])])
print("fim")

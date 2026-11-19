#!/usr/bin/env python3
"""Sonda TEMPORÁRIA (rodada 3). Só presença de campos e proporções — nunca valores."""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import fetch_meta as fm  # noqa: E402
ACC = "act_2327717030881984"; CAMP_IG = "120242674681220171"
today = fm.today_in("America/Sao_Paulo"); d = dt.timedelta(days=1)
def pct(a, b): return "—" if not b else f"{100.0 * a / b:.1f}%"
maxr = json.dumps({"since": "2023-11-01", "until": today.isoformat()})
r30 = json.dumps({"since": (today - 30 * d).isoformat(), "until": (today - d).isoformat()})
F = "instagram_profile_follow_v2,profile_visit_view"
def presenca(nome, params):
    try:
        rows = fm.api_all(f"{ACC}/insights", {**params, "use_unified_attribution_setting": "true", "limit": 500})
    except Exception as e:  # noqa: BLE001
        print(f"[erro] {nome}: {str(e)[:200]}"); return []
    tem = {k: sum(1 for r in rows if k in r) for k in F.split(",")}
    tipos = {k: sorted({type(r[k]).__name__ for r in rows if k in r}) for k in F.split(",")}
    print(f"[{nome}] linhas={len(rows)} presença={tem} tipos={tipos}")
    return rows
print("== 1. presença dos campos por nível")
c = presenca("campanha IG, vida toda", {"level": "campaign", "time_range": maxr, "fields": "campaign_id," + F, "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": [CAMP_IG]}])})
cm = presenca("campanhas, vida toda", {"level": "campaign", "time_range": maxr, "fields": "campaign_id," + F})
am = presenca("anúncios, vida toda", {"level": "ad", "time_range": maxr, "fields": "ad_id,campaign_id," + F})
ad = presenca("anúncios, 30d, diário", {"level": "ad", "time_range": r30, "time_increment": 1, "fields": "ad_id," + F})
a30 = presenca("anúncios, 30d, total", {"level": "ad", "time_range": r30, "fields": "ad_id," + F})
c30 = presenca("conta, 30d, total", {"level": "account", "time_range": r30, "fields": F})
cd = presenca("campanhas, 30d, diário", {"level": "campaign", "time_range": r30, "time_increment": 1, "fields": "campaign_id," + F})
def s(rows, k): return sum(fm.campo_num(r.get(k)) for r in rows)
for k in F.split(","):
    print(f"   {k}: anúncios vida toda / campanhas vida toda = {pct(s(am, k), s(cm, k))} | anúncios 30d / conta 30d = {pct(s(a30, k), s(c30, k))} | diário anúncio 30d / conta 30d = {pct(s(ad, k), s(c30, k))} | diário campanha 30d / conta 30d = {pct(s(cd, k), s(c30, k))}")
print("== 2. Instagram por dia com since=d, until=d+1")
cfg = json.load(open("public/config.json", encoding="utf-8")); ig = cfg["brands"][0]["meta"]["ig_user_id"]
def tv(metric, a, b):
    res = fm.api(f"{ig}/insights", {"metric": metric, "period": "day", "metric_type": "total_value", "since": a.isoformat(), "until": b.isoformat()}, retries=2)
    return {x.get("name"): fm.inum((x.get("total_value") or {}).get("value")) for x in res.get("data", [])}
T = tv("profile_views,accounts_engaged,views", today - 30 * d, today)
S = {"profile_views": 0, "accounts_engaged": 0, "views": 0}; vazios = 0
for i in range(30, 0, -1):
    dia = today - i * d
    v = tv("profile_views,accounts_engaged,views", dia, dia + d)
    if not v: vazios += 1
    for k in S: S[k] += v.get(k, 0)
print("   dias vazios:", vazios)
for k in S: print(f"   {k}: soma diária / total 30d = {pct(S[k], T.get(k, 0))}")
print("fim")

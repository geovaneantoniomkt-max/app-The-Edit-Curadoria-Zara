#!/usr/bin/env python3
"""Sonda TEMPORÁRIA (rodada 4): seguidores atribuídos aos anúncios em versões novas da API e
métricas por publicação do Instagram. Só presença e nomes — nunca valores."""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import fetch_meta as fm  # noqa: E402
ACC = "act_2327717030881984"; CAMP_IG = "120242674681220171"
today = fm.today_in("America/Sao_Paulo")
maxr = json.dumps({"since": "2023-11-01", "until": today.isoformat()})
for v in ("v24.0", "v25.0", "v26.0"):
    fm.BASE = f"https://graph.facebook.com/{v}"
    try:
        rows = fm.api_all(f"{ACC}/insights", {"level": "campaign", "time_range": maxr, "use_unified_attribution_setting": "true",
            "fields": "campaign_id,instagram_profile_follow_v2,profile_visit_view,actions",
            "filtering": json.dumps([{"field": "campaign.id", "operator": "IN", "value": [CAMP_IG]}])})
        r = rows[0] if rows else {}
        segue = sorted({a.get("action_type") for a in r.get("actions") or [] if "follow" in (a.get("action_type") or "")})
        print(f"[{v}] ok | presença follow_v2={'instagram_profile_follow_v2' in r} visit_view={'profile_visit_view' in r} | ações com 'follow': {segue}")
    except Exception as e:  # noqa: BLE001
        print(f"[{v}] erro: {str(e)[:200]}")
fm.BASE = "https://graph.facebook.com/v23.0"
print("== métricas por publicação do Instagram (follows, profile_visits)")
cfg = json.load(open("public/config.json", encoding="utf-8")); ig = cfg["brands"][0]["meta"]["ig_user_id"]
medias = fm.api(f"{ig}/media", {"fields": "id,media_type,media_product_type", "limit": 8}).get("data", [])
for m in medias:
    for metr in ("follows,profile_visits", "follows", "profile_visits"):
        try:
            res = fm.api(f"{m['id']}/insights", {"metric": metr}, retries=1)
            print(f"   {m.get('media_product_type')}/{m.get('media_type')}: [{metr}] ok → {[d.get('name') for d in res.get('data', [])]}")
            break
        except Exception as e:  # noqa: BLE001
            print(f"   {m.get('media_product_type')}/{m.get('media_type')}: [{metr}] recusado: {str(e)[:120]}")
print("== anúncios: mídia do Instagram por trás do criativo (para casar post × anúncio)")
ads = fm.api(f"{ACC}/ads", {"fields": "id,creative{effective_instagram_media_id,instagram_permalink_url,object_type}", "limit": 25}).get("data", [])
com_midia = sum(1 for a in ads if (a.get("creative") or {}).get("effective_instagram_media_id"))
print(f"   anúncios com effective_instagram_media_id: {com_midia} de {len(ads)}")
print("fim")

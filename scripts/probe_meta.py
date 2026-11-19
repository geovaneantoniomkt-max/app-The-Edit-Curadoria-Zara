#!/usr/bin/env python3
"""Sonda TEMPORÁRIA (rodada 2): formatos e semântica de datas. Só imprime nomes, tipos,
datas e proporções — nunca valores absolutos do cliente (o log do Actions é público)."""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import fetch_meta as fm  # noqa: E402

ACC = "act_2327717030881984"
today = fm.today_in("America/Sao_Paulo")
d = dt.timedelta(days=1)
def pct(a, b): return "—" if not b else f"{100.0 * a / b:.1f}%"

print("hoje (fuso da conta):", today)
print("== A. formato dos campos novos no nível anúncio, série diária")
r = fm.api(f"{ACC}/insights", {"level": "ad", "time_increment": 1, "limit": 20,
    "time_range": json.dumps({"since": (today - 7 * d).isoformat(), "until": (today - d).isoformat()}),
    "fields": "ad_id,results,instagram_profile_follow_v2,profile_visit_view,total_profile_visits", "use_unified_attribution_setting": "true"})
tipos = {}
for row in r.get("data", []):
    for k in ("results", "instagram_profile_follow_v2", "profile_visit_view", "total_profile_visits"):
        if k in row:
            v = row[k]
            tipos.setdefault(k, set()).add(type(v).__name__ + (f"[{type(v[0]).__name__}:{sorted(v[0].keys())}]" if isinstance(v, list) and v and isinstance(v[0], dict) else ""))
print("   tipos:", {k: sorted(v) for k, v in tipos.items()})
print("   linhas sem results:", sum(1 for row in r.get("data", []) if "results" not in row), "de", len(r.get("data", [])))

cfg = json.load(open("public/config.json", encoding="utf-8"))
ig = cfg["brands"][0]["meta"]["ig_user_id"]; page = cfg["brands"][0]["meta"]["page_id"]
ptoken = fm.api(page, {"fields": "access_token"}).get("access_token")

print("== B. datas dos valores diários (period=day) — qual dia cada end_time representa")
res = fm.api(f"{ig}/insights", {"metric": "reach", "period": "day", "since": (today - 3 * d).isoformat(), "until": today.isoformat()})
for dd in res.get("data", []):
    print("   IG reach pedido", (today - 3 * d), "→", today, "| end_time:", [v.get("end_time") for v in dd.get("values", [])])
res = fm.api(f"{page}/insights", {"metric": "page_post_engagements", "period": "day", "since": (today - 3 * d).isoformat(), "until": today.isoformat()}, token=ptoken)
for dd in res.get("data", []):
    print("   FB engajamento pedido", (today - 3 * d), "→", today, "| end_time:", [v.get("end_time") for v in dd.get("values", [])])

print("== C. total_value: since=d,until=d  vs  since=d,until=d+1  (profile_views, 30 dias)")
def tv(metric, a, b, extra=None):
    res = fm.api(f"{ig}/insights", {"metric": metric, "period": "day", "metric_type": "total_value", "since": a.isoformat(), "until": b.isoformat(), **(extra or {})}, retries=2)
    return {x.get("name"): (x.get("total_value") or {}) for x in res.get("data", [])}
T = fm.inum(tv("profile_views", today - 30 * d, today)["profile_views"].get("value"))
A = B = 0
for i in range(30, 0, -1):
    dia = today - i * d
    try: A += fm.inum(tv("profile_views", dia, dia)["profile_views"].get("value"))
    except Exception as e: print("   erro A", str(e)[:120]); break
    try: B += fm.inum(tv("profile_views", dia, dia + d)["profile_views"].get("value"))
    except Exception as e: print("   erro B", str(e)[:120]); break
print(f"   soma (d,d) / total 30d = {pct(A, T)} | soma (d,d+1) / total 30d = {pct(B, T)}")

print("== D. seguidores: follows_and_unfollows × follower_count (30 dias)")
fu = tv("follows_and_unfollows", today - 30 * d, today, {"breakdown": "follow_type"})["follows_and_unfollows"]
dims = {}
for b in fu.get("breakdowns", []):
    for it in b.get("results", []):
        dims[tuple(it.get("dimension_values") or [])] = fm.inum(it.get("value"))
fc = fm.api(f"{ig}/insights", {"metric": "follower_count", "period": "day", "since": (today - 30 * d).isoformat(), "until": today.isoformat()})
soma_fc = sum(fm.inum(v.get("value")) for x in fc.get("data", []) for v in x.get("values", []))
print("   dimensões:", list(dims.keys()))
for k, v in dims.items():
    print(f"   {k} / soma follower_count = {pct(v, soma_fc)}")
print("   dias em follower_count:", sum(len(x.get('values', [])) for x in fc.get('data', [])))

print("== E. alcance único 30d × soma do alcance diário")
R = fm.inum(tv("reach", today - 30 * d, today)["reach"].get("value"))
rd = fm.api(f"{ig}/insights", {"metric": "reach", "period": "day", "since": (today - 30 * d).isoformat(), "until": today.isoformat()})
soma_r = sum(fm.inum(v.get("value")) for x in rd.get("data", []) for v in x.get("values", []))
print(f"   único / soma diária = {pct(R, soma_r)}")
print("fim")

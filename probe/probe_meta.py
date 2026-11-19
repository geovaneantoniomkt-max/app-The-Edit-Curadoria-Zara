#!/usr/bin/env python3
"""Sonda TEMPORÁRIA (rodada 5): seguidores atribuídos a cada anúncio pela API pública.
Compara com os valores do Gerenciador sem imprimir números (só presença e se bate)."""
import json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fetch_meta as fm  # noqa: E402

ACC = "act_2327717030881984"
# vida toda, coluna "Seguidores no Instagram" do Gerenciador em 19/11 (só para comparar; nunca impresso)
REF = {"120242676334780171": 4548, "120249434773180171": 552, "120250690498760171": 1317, "120221736005180171": 1855}
IDS = list(REF)
filt = json.dumps([{"field": "ad.id", "operator": "IN", "value": IDS}])

def bate(rows, campo="instagram_profile_follow_v2"):
    pres = [r for r in rows if r.get(campo) not in (None, "", [])]
    iguais = 0
    for r in pres:
        v = r.get(campo)
        if isinstance(v, list):
            v = sum(fm.fnum(x.get("value")) for x in v)
        if abs(fm.fnum(v) - REF.get(r.get("ad_id"), -1)) <= max(3, 0.01 * REF.get(r.get("ad_id"), 0)):
            iguais += 1
    return f"linhas={len(rows)} com_valor={len(pres)} iguais_ao_gerenciador={iguais}"

def tenta(rotulo, versao, path, params):
    fm.BASE = f"https://graph.facebook.com/{versao}"
    try:
        rows = fm.api_all(path, params)
        print(f"[ok] {rotulo}: {bate(rows)} | chaves={sorted({k for r in rows for k in r})[:12]}")
    except Exception as e:  # noqa: BLE001
        print(f"[recusado] {rotulo}: {str(e)[:160]}")

base = {"level": "ad", "date_preset": "maximum", "filtering": filt, "fields": "ad_id,instagram_profile_follow_v2"}
print("== 1. variações no endpoint da conta")
for v in ("v23.0", "v24.0", "v25.0", "v26.0"):
    tenta(f"{v} padrão", v, f"{ACC}/insights", base)
tenta("unified=true", "v23.0", f"{ACC}/insights", base | {"use_unified_attribution_setting": "true"})
tenta("account_attribution=true", "v23.0", f"{ACC}/insights", base | {"use_account_attribution_setting": "true"})
for t in ("mixed", "conversion", "impression", "lifetime"):
    tenta(f"action_report_time={t}", "v23.0", f"{ACC}/insights", base | {"action_report_time": t})
tenta("janelas 7d_click+1d_view", "v23.0", f"{ACC}/insights", base | {"action_attribution_windows": json.dumps(["7d_click", "1d_view"])})
tenta("janela default", "v23.0", f"{ACC}/insights", base | {"action_attribution_windows": json.dumps(["default"])})
tenta("breakdown publisher_platform", "v23.0", f"{ACC}/insights", base | {"breakdowns": "publisher_platform"})
tenta("com actions junto", "v23.0", f"{ACC}/insights", base | {"fields": "ad_id,instagram_profile_follow_v2,actions,results"})
print("== 2. direto no nó do anúncio")
for ad in IDS[:2]:
    tenta(f"nó {ad[-6:]} v23", "v23.0", f"{ad}/insights", {"date_preset": "maximum", "fields": "ad_id,instagram_profile_follow_v2"})
    tenta(f"nó {ad[-6:]} v26", "v26.0", f"{ad}/insights", {"date_preset": "maximum", "fields": "ad_id,instagram_profile_follow_v2"})
print("== 3. relatório assíncrono")
fm.BASE = "https://graph.facebook.com/v23.0"
try:
    q = dict(base); q["access_token"] = fm.TOKEN
    req = urllib.request.Request(f"{fm.BASE}/{ACC}/insights", data=urllib.parse.urlencode(q).encode(), method="POST")
    rid = json.load(urllib.request.urlopen(req, timeout=60)).get("report_run_id")
    for _ in range(30):
        st = fm.api(rid, {"fields": "async_status,async_percent_completion"})
        if st.get("async_status") in ("Job Completed", "Job Failed", "Job Skipped"):
            break
        time.sleep(4)
    print(f"   status: {st.get('async_status')}")
    rows = fm.api_all(f"{rid}/insights", {})
    print(f"[ok] assíncrono: {bate(rows)}")
except Exception as e:  # noqa: BLE001
    print(f"[erro] assíncrono: {str(e)[:160]}")
print("== 4. nomes alternativos (aceito/recusado)")
for campo in ("instagram_profile_follow", "instagram_profile_follows", "instagram_follows_v2", "ig_profile_follow",
              "onsite_conversion_ig_follow", "instagram_profile_follow_v2_unique", "unique_instagram_profile_follow_v2"):
    try:
        rows = fm.api_all(f"{ACC}/insights", base | {"fields": f"ad_id,{campo}"})
        print(f"[aceito] {campo}: {bate(rows, campo)}")
    except Exception as e:  # noqa: BLE001
        print(f"[recusado] {campo}: {str(e)[:90]}")
print("== 5. post impulsionado: o 'follows' do Instagram inclui o pago?")
ads = fm.api_all(f"{ACC}/ads", {"fields": "id,creative{effective_instagram_media_id}", "filtering": filt})
for a in ads:
    mid = (a.get("creative") or {}).get("effective_instagram_media_id")
    if not mid:
        print(f"   anúncio {a['id'][-6:]}: sem mídia do IG"); continue
    try:
        res = fm.api(f"{mid}/insights", {"metric": "follows"}, retries=1)
        val = sum(fm.fnum((d.get("values") or [{}])[0].get("value")) for d in res.get("data", []))
        print(f"   anúncio {a['id'][-6:]}: follows do post / seguidores do Gerenciador = {val / REF[a['id']]:.2f}")
    except Exception as e:  # noqa: BLE001
        print(f"   anúncio {a['id'][-6:]}: insights do post recusado: {str(e)[:100]}")
print("fim")

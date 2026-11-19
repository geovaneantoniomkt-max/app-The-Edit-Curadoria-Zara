#!/usr/bin/env python3
"""Auditoria TEMPORÁRIA dos seguidores por anúncio: resume o que o coletor gravou e imprime
CRIPTOGRAFADO (AES-256 + chave RSA). Nada em texto claro no log público."""
import base64, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fetch_meta as fm  # noqa: E402
PUB = """-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA7TSRbI8bs4rRPOLvWfQt
WKWVI4NL5JrHyE0oC0L4xP0n0Z3no7J3m9cZLV1oJpApgfIxEBPsGdAgn6D8oQpd
k8XlqrU2c2dMti8Zo6sKdl7sVy9+wsK/XV6K0NqObh/LPMuefzU5NnMrlmAyT+wb
eEA2g0a2eegJVzvm5kTT3MpmPyon1jf916GdZlW9yrpAHQbqqfMVy3upLpCSPaY0
OoQTxXTkQyFYfh6qx/ZcXQqP3HoC3KBsjSGuRK1f55zbQ14MY5JWPBupBXamHBVL
IOHNF9nrt9rXFNluuP3Nb8ONiyxIpbf36O5Q7b7Yu7UmpFqskurcCOYXxUHY5k16
ZSqygIYh7euHJddB6h8q+kjEVBd2x1OUotqNaNs0sqc4fyGmmTaClJ6yGwKf8sPU
CgWvYd64g5t0ix5c6/t5L90zcAQzR0QSg0a21hFm+NtgUWlgHi7/oVgipH6RtPAM
T0bs/STDI5C35hEszMc2edf+snxHG0asU7qSpTxasbgDAgMBAAE=
-----END PUBLIC KEY-----"""
m = json.load(open("public/data/meta-theedit.json", encoding="utf-8"))
out = {"generated_at": m.get("generated_at"), "windows": m.get("windows"), "audit": m.get("audit"),
       "warnings": m.get("warnings"), "fields_used": m.get("fields_used")}
for k in ("maximum", "last_30d", "last_14d", "last_7d", "this_month", "last_month"):
    snap = (m.get("snapshots") or {}).get(k) or {}
    out[k] = {
        "account": [[r.get("spend"), r.get("follows")] for r in snap.get("account", [])],
        "campaign": {r["campaign_id"]: [r.get("spend"), r.get("follows")] for r in snap.get("campaign", [])},
        "ad": {r["ad_id"]: [r.get("spend"), r.get("follows")] for r in snap.get("ad", []) if r.get("spend") or r.get("follows")},
    }
# série diária: soma dos seguidores por janela (para períodos personalizados)
for k in ("last_30d", "last_7d"):
    w = m["windows"][k]
    out[k]["daily_sum"] = sum(r.get("follows", 0) for r in m.get("daily", []) if w["since"] <= r["date"] <= w["until"])
# mídia do Instagram por anúncio (para agrupar por post)
out["ad_media"] = {a["id"]: (a.get("creative") or {}).get("instagram_media_id") for a in m.get("ads", [])}
# campo candidato para visitas ao perfil
try:
    w = m["windows"]["last_30d"]
    rows = fm.api_all("act_2327717030881984/insights", {"level": "campaign", "time_range": json.dumps({"since": w["since"], "until": w["until"]}),
                      "fields": "campaign_id,instagram_profile_visits,results", **fm.UNIFIED})
    out["visits_probe"] = [[r.get("campaign_id"), r.get("instagram_profile_visits"), fm.resultado(r)] for r in rows]
except Exception as e:  # noqa: BLE001
    out["visits_probe"] = str(e)[:200]
dados = json.dumps(out, ensure_ascii=False).encode()
with tempfile.TemporaryDirectory() as t:
    key = os.urandom(32); iv = os.urandom(16)
    open(f"{t}/pub.pem", "w").write(PUB); open(f"{t}/d", "wb").write(dados); open(f"{t}/k", "wb").write(key)
    subprocess.run(["openssl", "enc", "-aes-256-cbc", "-K", key.hex(), "-iv", iv.hex(), "-in", f"{t}/d", "-out", f"{t}/d.enc"], check=True)
    subprocess.run(["openssl", "pkeyutl", "-encrypt", "-pubin", "-inkey", f"{t}/pub.pem", "-pkeyopt", "rsa_padding_mode:oaep", "-in", f"{t}/k", "-out", f"{t}/k.enc"], check=True)
    pacote = {"k": base64.b64encode(open(f"{t}/k.enc", "rb").read()).decode(), "iv": iv.hex(), "d": base64.b64encode(open(f"{t}/d.enc", "rb").read()).decode()}
txt = base64.b64encode(json.dumps(pacote).encode()).decode()
print("BEGIN-ENC")
for i in range(0, len(txt), 3000):
    print(txt[i:i + 3000])
print("END-ENC")

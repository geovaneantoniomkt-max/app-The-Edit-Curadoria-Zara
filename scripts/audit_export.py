#!/usr/bin/env python3
"""Auditoria TEMPORÁRIA: resume os números que o painel mostra (totais por janela) e imprime
o resumo CRIPTOGRAFADO (AES-256 + chave embrulhada em RSA). Só quem tem a chave privada lê.
Nada em texto claro vai para o log público."""
import base64, json, os, subprocess, sys, tempfile
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
o = json.load(open("public/data/organic-theedit.json", encoding="utf-8")) if os.path.exists("public/data/organic-theedit.json") else {}
nome = {c["id"]: c.get("name") for c in m.get("campaigns", [])}
def resumo(r):
    a = r.get("actions") or {}
    return {k: r.get(k) for k in ("spend", "impressions", "reach", "frequency", "clicks", "link_clicks", "result")} | {
        "lpv": a.get("omni_landing_page_view"), "installs": a.get("mobile_app_install"), "reg": a.get("omni_complete_registration"), "link_click_action": a.get("link_click")}
out = {"generated_at": m.get("generated_at"), "windows": m.get("windows"), "audit": m.get("audit"), "warnings": m.get("warnings"), "fields_used": m.get("fields_used"), "has_results": m.get("has_results")}
for k in ("last_7d", "last_30d", "maximum", "this_month"):
    snap = (m.get("snapshots") or {}).get(k) or {}
    out[k] = {"account": [resumo(r) for r in snap.get("account", [])],
              "campaign": sorted([{"id": r.get("campaign_id"), "name": nome.get(r.get("campaign_id")), **resumo(r)} for r in snap.get("campaign", [])], key=lambda x: -(x["spend"] or 0))[:25]}
ig = (o.get("instagram") or {})
out["instagram"] = {"followers": ig.get("followers"), "totals": ig.get("totals"), "daily_last": {k: (v[-3:] if v else v) for k, v in (ig.get("daily") or {}).items()}, "warnings": o.get("warnings")}
fb = (o.get("facebook") or {})
out["facebook"] = {"followers": fb.get("followers"), "fans": fb.get("fans"), "daily_keys": list((fb.get("daily") or {}).keys()), "follows_last": (fb.get("daily") or {}).get("page_follows", [])[-3:]}
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

# Dashboard de performance — The Edit

Mesma arquitetura do dashboard da Lapidation: um coletor em Python roda no GitHub Actions, gera JSONs
com os dados do Meta e publica um site estático protegido por senha no Cloudflare Pages.

| Marca | Conta de anúncios | Página do Facebook | Instagram |
|---|---|---|---|
| **The Edit** | `2327717030881984` | `733971923143560` · The Edit | `@the_edit.br` (`17841464667685576`) |

```
GitHub Actions (todo dia 07:00 BRT)                 Cloudflare Pages
┌──────────────────────────────┐   wrangler deploy   ┌──────────────────────────────┐
│ fetch_meta.py                │ ──────────────────► │ functions/_middleware.js     │ ← senha + cabeçalhos
│  META_ACCESS_TOKEN (secret)  │   public/ + data/   │ public/index.html, app.js    │
│  → meta-theedit.json         │   (nunca vai p/ git)│ public/data/*.json           │ ← só com sessão válida
│  → organic-theedit.json      │                     └──────────────────────────────┘
└──────────────────────────────┘
       lê public/config.json — a mesma fonte que o front-end
```

- **O token do Meta nunca sai do GitHub Actions.** O site publicado não contém token e o navegador nunca fala com a API do Meta.
- **Os dados nunca entram no git** (`public/data/` está no `.gitignore`) — importante porque o repositório é público.
- **Tudo atrás de senha**, inclusive os JSONs. Sessão em cookie assinado (HMAC-SHA256), `HttpOnly`, `Secure`, `SameSite=Strict`, 12 h; bloqueio de 15 min após 5 senhas erradas por IP; CSP estrita sem scripts de terceiros.

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Nome | Para quê |
|---|---|
| `META_ACCESS_TOKEN` | Token de Usuário do Sistema com `ads_read`, `pages_read_engagement`, `pages_show_list`, `read_insights`, `instagram_basic`, `instagram_manage_insights`, `business_management` |
| `CLOUDFLARE_API_TOKEN` | Permissão **Cloudflare Pages: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |
| `DASHBOARD_PASSWORD` | Senha do painel (o workflow envia para o Pages) |
| `SESSION_SECRET` | Chave aleatória longa para assinar as sessões (o workflow envia para o Pages) |

Variables opcionais: `META_API_VERSION` (padrão `v23.0`), `CF_PAGES_PROJECT` (padrão `the-edit-dashboard`).

Sem as permissões de Página/Instagram o Meta Ads continua funcionando; o orgânico aparece vazio e o motivo
fica em "Avisos da coleta orgânica" e no resumo do workflow.

## Workflow

`.github/workflows/update-dashboard.yml` roda todo dia às **07:00 (Brasília)**, manualmente
(**Actions → Atualizar dashboard → Run workflow**) e a cada push que altere `public/`, `functions/`,
`scripts/` ou o próprio workflow. **Só a branch padrão do repositório publica**; em outro branch ele coleta
e confere, sem trocar o painel do cliente. O agendamento diário também roda só na branch padrão.

## Frentes, resultados e metas

A The Edit não capta contato nem vende no site, então o painel se organiza por **frente** (`"layout": "frentes"`
no `config.json`): cada campanha é medida pelo resultado que otimiza.

| Frente | Resultado | Meta (`targets`) |
|---|---|---|
| Tráfego para a LP | Visualizações da página de destino | `cost_per_lpv` |
| Tráfego para o Instagram | Visitas ao perfil (cliques no link — a API não expõe a visita) | `cost_per_profile_visit` |
| Promoção do app | Instalações do app (SDK da Meta) | `cost_per_install` |
| App (qualidade) | Cadastros no app (`fb_mobile_complete_registration`) | `cost_per_app_registration` |

Todas as metas e a verba mensal estão **`null` de propósito**: nunca foram acordadas. Enquanto forem `null`,
o painel mostra o custo sem selo de meta. Ajuste em `public/config.json` (vale para todos) ou no menu lateral
(fica salvo só no navegador de quem ajustou).

## Rodar localmente

```bash
META_ACCESS_TOKEN=EAAB... python scripts/fetch_meta.py   # gera public/data/*.json
npm run dev                                              # http://localhost:8788 (precisa de .dev.vars com DASHBOARD_PASSWORD e SESSION_SECRET)
```

## Estrutura

```
public/            site estático (index.html, app.js, styles.css, config.json, login.css)
public/data/       JSONs gerados — ignorados pelo git
functions/         _middleware.js (senha, sessão, cabeçalhos de segurança)
scripts/           fetch_meta.py (Meta Ads + orgânico + eventos do app)
.github/workflows/ update-dashboard.yml (coleta + deploy diário)
```

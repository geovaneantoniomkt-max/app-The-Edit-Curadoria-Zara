# The Edit · Dashboard de performance

Dashboard da The Edit com os dados das campanhas de **Meta Ads** e do **app** (instalações, cadastros e demais eventos do SDK da Meta). Roda no **Cloudflare Pages** (com o servidor em `_worker.js`), protegido por senha, e é publicado automaticamente pelo **GitHub Actions**.

## O que tem no painel

| Aba | Conteúdo |
| --- | --- |
| **Visão geral** | Investimento do período (com comparação ao período anterior), impressões, alcance, frequência, cliques, CTR, CPC, CPM, resultados por objetivo (visitas na LP, visitas ao perfil, instalações…), evolução diária, distribuição do investimento por campanha, dados da conta e todas as ações registradas pela Meta. |
| **Campanhas** | Tabela ordenável com orçamento, métricas e resultado/custo por resultado de cada campanha; clique na seta para abrir os conjuntos de anúncios. Exporta CSV. |
| **Criativos** | Miniaturas dos anúncios com investimento, resultados, custo, CTR e link para a publicação. Filtro por campanha e ordenação. |
| **App** | Investimento em app, instalações, CPI, cadastros, funil (impressão → clique → instalação → cadastro), instalações e CPI por dia, todos os eventos do app, públicos e dispositivos. |
| **Público** | Idade e gênero, plataformas/posicionamentos, regiões e dispositivos — para todas as campanhas, só as de app ou uma campanha específica. |

O **resultado** de cada campanha segue a meta de otimização dos conjuntos (ex.: tráfego para LP → visualizações da página de destino; perfil do Instagram → visitas ao perfil; promoção do app → instalações), como no Gerenciador de Anúncios. A atribuição usa a configuração de cada conjunto (`use_unified_attribution_setting`).

## Como funciona

```
Navegador ──(senha + cookie assinado)──▶ Cloudflare Pages (_worker.js) ──(token, só no servidor)──▶ Meta Marketing API
```

- O token da Meta **nunca** vai para o navegador: o servidor faz as consultas e devolve só os números.
- Login com uma senha única (`DASHBOARD_PASSWORD`); a sessão é um cookie `HttpOnly` assinado com `SESSION_SECRET` e vale 7 dias. Trocar a senha derruba todas as sessões.
- As respostas da Meta ficam em cache por 10 minutos (períodos antigos: 6 horas). O botão **Atualizar** ignora o cache.

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Obrigatório | Para quê |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | sim | Publicar no Pages. Precisa da permissão **Cloudflare Pages: Edit** na conta. |
| `META_ACCESS_TOKEN` | sim | Ler os dados da conta de anúncios (permissão `ads_read`). Use um token de **Usuário do Sistema** do Business Manager da The Edit, que não expira. |
| `DASHBOARD_PASSWORD` | sim | Senha de acesso ao painel. |
| `SESSION_SECRET` | sim | Texto aleatório longo para assinar o cookie de sessão. |
| `CLOUDFLARE_ACCOUNT_ID` | sim (se o token não puder listar contas) | Account ID da Cloudflare (Workers & Pages → lateral direita). |
| `META_APP_SECRET` | só se o app da Meta exigir *App Secret Proof* | Chave secreta do app da Meta. |

A conta de anúncios fica em `wrangler.toml` (`META_AD_ACCOUNT_ID = "2327717030881984"`, conta **The Edit**). Para apontar para outra conta, troque esse valor.

## Deploy

O workflow `.github/workflows/deploy.yml` roda a cada push na branch `main` ou manualmente em **Actions → Deploy do dashboard → Run workflow**. Ele:

1. confere se os secrets existem e se o token da Meta consegue ler a conta;
2. usa `CLOUDFLARE_ACCOUNT_ID` (ou descobre a conta pelo token);
3. cria o projeto `the-edit-dashboard` no Pages na primeira vez;
4. envia `META_ACCESS_TOKEN`, `DASHBOARD_PASSWORD` e `SESSION_SECRET` como secrets do projeto;
5. gera `dist/` (`npm run build`) e publica (`wrangler pages deploy`);
6. testa `/healthz` e mostra a URL no resumo da execução (`https://the-edit-dashboard.pages.dev`).

## Rodar localmente

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev:mock     # Graph API falsa com dados sintéticos (porta 9999)
npm run dev          # em outro terminal: gera dist/ e abre http://127.0.0.1:8787
```

Para usar dados reais localmente, remova `META_GRAPH_BASE` do `.dev.vars` e coloque um token válido em `META_ACCESS_TOKEN`.

## Estrutura

```
src/index.js     rotas, cabeçalhos de segurança, tratamento de erros
src/auth.js      login por senha e cookie de sessão assinado
src/meta.js      cliente da Graph API (paginação, cache, mensagens de erro)
src/metrics.js   extração de métricas e mapeamento de resultados por objetivo
src/report.js    monta /api/report, /api/ads e /api/breakdown
public/          interface (HTML, CSS e JS sem dependências externas)
scripts/build.mjs  gera dist/ (public/ + src/ em dist/_worker.js/) para o Pages
dev/mock-graph.mjs  Graph API falsa para desenvolvimento
```

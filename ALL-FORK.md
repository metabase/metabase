# Portal BI — ALL Tecnologias (fork do Metabase OSS)

Fork do [Metabase](https://github.com/metabase/metabase) open source (AGPL-3.0) com a identidade
visual da ALL Tecnologias. **Nenhum código da pasta `enterprise/` é usado ou alterado.**

Base atual: `v0.63.18.4` · Branch: `all-branding`

## O que foi alterado

| O quê | Onde editar |
|---|---|
| Nome "B.I ALL Tecnologias" na interface, mensagens de carregamento, links do metabase.com ocultos | `frontend/src/metabase/branding/config.ts` |
| Nome no título da aba/e-mails, **cores da marca**, logo padrão | `src/metabase/appearance/settings.clj` (valores `:default`) |
| Logo da barra superior | `resources/frontend_client/app/assets/img/all-logo.svg` |
| Favicon | `resources/frontend_client/app/assets/img/favicon.ico` (+ `favicon-16x16.png`, `favicon-32x32.png`) |
| Logo dos e-mails (assinaturas de dashboard) | `resources/frontend_client/app/assets/img/email_logo.png` |

Arquivos de apoio: `.github/workflows/all-build.yml` (build da imagem), `bin/all-upgrade.sh` (atualização de versão).

> Logo oficial (símbolo do chip) vetorizado em `all-logo.svg`; cor da marca `#35A8E0`. Para trocar, mantenha os mesmos nomes de arquivo.

### Como funciona (resumo técnico)
As configurações de aparência do Metabase (`application-name`, `application-colors`,
`application-logo-url`) existem no código AGPL, mas sem licença paga o backend sempre devolve o
**valor padrão**. O fork só troca esses padrões e os seletores OSS do frontend — o gate de licença
não é removido nem contornado.

### O que NÃO foi alterado (de propósito)
- **Selo "Powered by Metabase" nos embeds estáticos** (`frontend/src/metabase/embedding/components/LogoBadge/`).
  A licença de embedding do Metabase isenta sua aplicação da AGPL *desde que o selo permaneça*.
  Remover é permitido pela AGPL neste fork, mas aí sua aplicação que embute os painéis perde essa isenção.
  Decida com calma antes de mexer.
- Selo "Made with Metabase" nos PDFs exportados (`src/metabase/channel/render/pdf.clj`) — pode ser
  removido depois, se quiser.
- Testes do upstream que esperam o texto "Metabase" não foram ajustados (o build de produção não os roda).

## Grupos de cliente (interface reduzida)

Em **Admin → Pessoas → Grupos → (grupo)** há o interruptor **"Grupo de cliente"**. Membros desses
grupos (que não sejam administradores) veem apenas as coleções liberadas para eles:

- somem o botão **Novo**, o **Metabot**, **Início**, **Sua coleção pessoal**, a seção **Dados**
  (bancos, modelos, métricas), **Lixeira** e favoritos;
- ao abrir o portal (ou clicar no logo) vão direto para a primeira coleção liberada.

Os grupos marcados ficam na configuração `all-client-group-ids`. Isso só muda a interface: o acesso
real aos dados continua definido em **Admin → Permissões** (Dados: sem acesso; Coleções: só
visualização da pasta do cliente).

## Build

O GitHub Actions gera a imagem automaticamente a cada push no branch `all-branding`
(ou manualmente em **Actions → Build ALL Portal BI → Run workflow**). O build leva ~40–90 min.

Tags geradas em `ghcr.io/<seu-usuario>/portal-bi`:
- `v0.63.18.4-all.<N>` — uma por build (N = número da execução); use esta no Portainer
- `v0.63.18.4-all` e `latest` — sempre o build mais recente

Local (máquina com 8+ GB de RAM livres):
```bash
docker build --build-arg MB_EDITION=oss --build-arg VERSION=v0.63.18.4-all.0 -t portal-bi:local .
```

## Deploy no Portainer

Troque só a imagem da stack atual; o banco de aplicação (Postgres/H2) continua o mesmo.

```yaml
services:
  metabase:
    image: ghcr.io/<seu-usuario>/portal-bi:v0.63.18.4-all.<N>
    # ...mantenha environment, volumes e portas que você já usa
```

Depois do primeiro start:
1. **Admin → Configurações → Geral → Nome do site**: troque para "B.I ALL Tecnologias" (o valor antigo
   fica salvo no banco e tem prioridade sobre o padrão do fork).
2. Confirme a **URL do site** — o logo dos e-mails depende dela.
3. Faça backup do banco antes de trocar a imagem, como em qualquer upgrade.

## Atualizar para uma nova versão do Metabase

```bash
bin/all-upgrade.sh v0.63.18.4 v0.64.1
# edite BASE_VERSION em .github/workflows/all-build.yml para v0.64.1 e faça commit
git push --force-with-lease origin all-branding   # dispara o build
```

## Licença (AGPL-3.0)

Como os clientes acessam o portal pela rede, a AGPL exige que o código-fonte modificado esteja
disponível para eles. Mantenha este repositório **público** e, se quiser, inclua um link para ele no
rodapé ou na tela "Sobre". Os avisos de copyright e os arquivos `LICENSE*` do Metabase devem permanecer.
"Metabase" é marca registrada da Metabase, Inc.; este fork não é afiliado nem endossado por ela.

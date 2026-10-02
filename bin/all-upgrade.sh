#!/usr/bin/env bash
# Atualiza o fork ALL Tecnologias para uma nova versão do Metabase.
#
# Uso:  bin/all-upgrade.sh v0.63.18.4 v0.64.1
#
# O que faz:
#   1. Busca as tags do upstream (metabase/metabase)
#   2. Reaplica os commits do branch all-branding em cima da nova tag
#   3. Resolve sozinho os conflitos em .github/workflows (sempre removemos os do upstream)
#   4. Para em qualquer outro conflito para você resolver à mão
set -euo pipefail

OLD_TAG="${1:?informe a tag atual, ex.: v0.63.18.4}"
NEW_TAG="${2:?informe a nova tag, ex.: v0.64.1}"
BRANCH="all-branding"

git remote get-url upstream >/dev/null 2>&1 \
  || git remote add upstream https://github.com/metabase/metabase.git
git fetch upstream "refs/tags/${NEW_TAG}:refs/tags/${NEW_TAG}" --no-tags

git checkout "$BRANCH"
git branch -f "${BRANCH}-backup-${OLD_TAG}" "$BRANCH"
echo ">> Backup criado: ${BRANCH}-backup-${OLD_TAG}"

resolve_workflows() {
  # Remove qualquer workflow do upstream que tenha voltado; mantém só all-*.yml
  git ls-files .github/workflows | grep -v '/all-[^/]*$' | xargs -r git rm -q --
  git diff --name-only --diff-filter=U | grep -q . && return 1 || return 0
}

if ! git rebase --onto "$NEW_TAG" "$OLD_TAG" "$BRANCH"; then
  while [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; do
    if resolve_workflows; then
      GIT_EDITOR=true git rebase --continue || true
    else
      echo ">> Conflito fora de .github/workflows. Resolva, faça 'git add' e rode 'git rebase --continue'."
      git diff --name-only --diff-filter=U
      exit 1
    fi
  done
fi

echo ">> OK. Branch $BRANCH agora está sobre $NEW_TAG."
echo ">> Próximo passo: atualize BASE_VERSION para ${NEW_TAG} em .github/workflows/all-build.yml,"
echo ">> faça commit e rode: git push --force-with-lease origin $BRANCH  (o push dispara o build)"

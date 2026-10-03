#!/usr/bin/env bash
set -euo pipefail
ID=$1
PATCH=$2
SPEC=$3
GREP=$4
REPO_ROOT=${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}
WT=${CORPUS_WORKTREE:-$REPO_ROOT}
BASE=8317274709c
CORPUS_OUT=${CORPUS_OUT:-$REPO_ROOT/local/regression-corpus/overnight}
LOG=$CORPUS_OUT/generators/e2e-dispatches.jsonl
BRANCH=corpus-mutant/$ID
mkdir -p "$(dirname "$LOG")"

cd "$WT"
test -z "$(git status --porcelain)"
git checkout -q -b "$BRANCH" "$BASE"
git apply "$PATCH"
git add -A -- frontend src enterprise
git commit -q --no-verify -m "corpus mutant $ID"
git push -q --no-verify origin "$BRANCH"
git checkout -q --detach "$BASE"
git branch -q -D "$BRANCH"

gh workflow run e2e-stress-test-flake-fix.yml --repo metabase/metabase --ref "$BRANCH" \
  -f spec="$SPEC" -f grep="$GREP" -f burn_in=1 -f build_jar=true
sleep 8
RUN=""
for _ in 1 2 3 4 5 6; do
  RUN=$(gh run list --repo metabase/metabase --workflow e2e-stress-test-flake-fix.yml --branch "$BRANCH" --json databaseId,url -L1 --jq '.[0] | "\(.databaseId) \(.url)"' || true)
  [ -n "$RUN" ] && break
  sleep 5
done
RUN_ID=${RUN%% *}
URL=${RUN#* }
node -e 'const [id,branch,spec,grep,run,url]=process.argv.slice(1);console.log(JSON.stringify({id,branch,spec,grep,run_id:Number(run)||null,url,dispatched_at:new Date().toISOString()}))' "$ID" "$BRANCH" "$SPEC" "$GREP" "$RUN_ID" "$URL" >> "$LOG"
echo "$ID $RUN_ID $URL"

#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=${REPO_ROOT:-$(cd "$HERE/../../.." && pwd)}
CORPUS_WORKTREE=${CORPUS_WORKTREE:-$REPO_ROOT}
CORPUS_OUT=${CORPUS_OUT:-$REPO_ROOT/local/regression-corpus/overnight}
G=$CORPUS_OUT/generators
OUT=${1:-$G/coverage}
mkdir -p "$OUT"
rm -f "$OUT"/per-spec.jsonl "$OUT"/per-spec.statements.jsonl
cd "$CORPUS_WORKTREE"
args=()
while read -r f; do args+=("--collectCoverageFrom=$f"); done < <(node -e "require('$G/coverage-files.json').forEach(f=>console.log(f))")
PER_SPEC_COV_OUT="$OUT/per-spec.jsonl" npx jest --ignoreProjects ci-scripts lint-rules --maxWorkers=4 --silent \
  --coverage --coverageReporters=none "${args[@]}" \
  --reporters=summary --reporters="$HERE/per-spec-coverage-reporter.cjs" "${@:2}" > "$OUT/jest.log" 2>&1 || true
tail -8 "$OUT/jest.log"

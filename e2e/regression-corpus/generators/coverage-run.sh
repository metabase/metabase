#!/usr/bin/env bash
set -euo pipefail
G=/Users/fraser/Documents/code/metabase/local/regression-corpus/overnight/generators
OUT=${1:-$G/coverage}
mkdir -p "$OUT"
rm -f "$OUT"/per-spec.jsonl "$OUT"/per-spec.statements.jsonl
cd /private/tmp/metabase-corpus-mutants
args=()
while read -r f; do args+=("--collectCoverageFrom=$f"); done < <(node -e "require('$G/coverage-files.json').forEach(f=>console.log(f))")
PER_SPEC_COV_OUT="$OUT/per-spec.jsonl" npx jest --ignoreProjects ci-scripts lint-rules --maxWorkers=4 --silent \
  --coverage --coverageReporters=none "${args[@]}" \
  --reporters=summary --reporters="$G/per-spec-coverage-reporter.cjs" "${@:2}" > "$OUT/jest.log" 2>&1 || true
tail -8 "$OUT/jest.log"

#!/bin/bash
# For issues in fix-commits.jsonl, take the OLDEST commit that introduced the repro-test
# title (= fix-commit candidate) and test whether its product-code diff (test files
# excluded, so the repro test survives) reverse-applies cleanly to the current tree.
# Usage: check-clean-revert.sh [max_issues]
# Writes revert-check.jsonl: {issue, commit, date, subject, product_files, status}
#   status: clean | conflict | test_only | no_candidate
set -u
cd "$(dirname "$0")/../.."
OUT="regression-corpus/revert-check.jsonl"
MAX="${1:-50}"

EXCLUDES=(':(exclude)e2e/*' ':(exclude)test/*' ':(exclude)enterprise/backend/test/*'
  ':(exclude)frontend/test/*' ':(exclude)*_test.clj' ':(exclude)*_test.cljc'
  ':(exclude)*.unit.spec.js' ':(exclude)*.unit.spec.ts' ':(exclude)*.unit.spec.tsx'
  ':(exclude)*.spec.ts' ':(exclude)*.spec.tsx' ':(exclude)*.spec.js'
  ':(exclude)*.stories.tsx' ':(exclude)docs/*' ':(exclude)dev/*')

: > "$OUT"
count=0
while IFS= read -r line; do
  [ "$count" -ge "$MAX" ] && break
  eval "$(node -e '
const r=JSON.parse(process.argv[1]);
const c=r.introduced.length ? r.introduced[r.introduced.length-1] : null;
console.log(`issue=${r.issue}`);
console.log(`commit=${c?c.hash:""}`);
console.log(`cdate=${c?c.date:""}`);
' "$line")"
  count=$((count+1))
  if [ -z "$commit" ]; then
    echo "{\"issue\":$issue,\"status\":\"no_candidate\"}" >> "$OUT"; continue
  fi
  subject=$(git log -1 --format='%s' "$commit" | sed 's/"/\\"/g')
  diff=$(git diff "$commit^" "$commit" -- "${EXCLUDES[@]}" 2>/dev/null)
  if [ -z "$diff" ]; then
    status="test_only"; files=0
  else
    files=$(git diff --name-only "$commit^" "$commit" -- "${EXCLUDES[@]}" | wc -l | tr -d ' ')
    if printf '%s\n' "$diff" | git apply -R --check - 2>/dev/null; then
      status="clean"
    else
      status="conflict"
    fi
  fi
  echo "{\"issue\":$issue,\"commit\":\"$commit\",\"date\":\"$cdate\",\"subject\":\"$subject\",\"product_files\":$files,\"status\":\"$status\"}" >> "$OUT"
done < regression-corpus/fix-commits.jsonl

node -e '
const fs=require("fs");
const rows=fs.readFileSync("regression-corpus/revert-check.jsonl","utf8").trim().split("\n").map(JSON.parse);
const by={};for(const r of rows)by[r.status]=(by[r.status]||0)+1;
console.log("checked:",rows.length,JSON.stringify(by));
'

#!/bin/bash
# Sharded copy of check-clean-revert.sh. Processes the (line % SHARD_TOTAL == SHARD_IDX)
# lines of fix-commits.jsonl and writes to its OWN revert-check.shard-<IDX>.jsonl.
# All git ops (diff of historical commits, `git apply -R --check`) are READ-ONLY on the
# working tree, so N of these run concurrently safely. Merge the shards afterwards.
# Usage: SHARD_IDX=<0..N-1> SHARD_TOTAL=<N> check-clean-revert-shard.sh
set -u
cd "$(dirname "$0")/../.."
: "${SHARD_IDX:?}" "${SHARD_TOTAL:?}"
OUT="regression-corpus/revert-check.shard-$SHARD_IDX.jsonl"

EXCLUDES=(':(exclude)e2e/*' ':(exclude)test/*' ':(exclude)enterprise/backend/test/*'
  ':(exclude)frontend/test/*' ':(exclude)*_test.clj' ':(exclude)*_test.cljc'
  ':(exclude)*.unit.spec.js' ':(exclude)*.unit.spec.ts' ':(exclude)*.unit.spec.tsx'
  ':(exclude)*.spec.ts' ':(exclude)*.spec.tsx' ':(exclude)*.spec.js'
  ':(exclude)*.stories.tsx' ':(exclude)docs/*' ':(exclude)dev/*')

: > "$OUT"
ln=-1
while IFS= read -r line; do
  ln=$((ln+1))
  [ $((ln % SHARD_TOTAL)) -eq "$SHARD_IDX" ] || continue
  eval "$(node -e '
const r=JSON.parse(process.argv[1]);
const c=r.introduced.length ? r.introduced[r.introduced.length-1] : null;
console.log(`issue=${r.issue}`);
console.log(`commit=${c?c.hash:""}`);
console.log(`cdate=${c?c.date:""}`);
' "$line")"
  if [ -z "$commit" ]; then
    echo "{\"issue\":$issue,\"status\":\"no_candidate\"}" >> "$OUT"; continue
  fi
  subject=$(git log -1 --format='%s' "$commit" | sed 's/\\/\\\\/g; s/"/\\"/g')
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
echo "scan shard $SHARD_IDX/$SHARD_TOTAL done ($(wc -l < "$OUT" | tr -d ' ') rows)"

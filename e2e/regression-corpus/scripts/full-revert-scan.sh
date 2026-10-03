#!/bin/bash
# Stage 1 (parallelized): wait for the (sharded) fix-commit mapper to finish, then
# classify EVERY mapped issue's clean-revert status over the full population using N
# concurrent read-only scan shards, merge, and summarize. Nothing mutates the tree.
set -u
SC=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}
CORPUS_OUT=${CORPUS_OUT:-$REPO_ROOT/local/regression-corpus/overnight}
DATA="$CORPUS_OUT/july-corpus"
cd "${CORPUS_WORKTREE:-$REPO_ROOT}"
mkdir -p "$DATA/logs"
K="${SCAN_SHARDS:-10}"

# preserve the pilot's 84-issue classification (idempotent)
if [ ! -f "$DATA/revert-check.head84.jsonl" ]; then
  cp "$DATA/revert-check.jsonl" "$DATA/revert-check.head84.jsonl"
  echo "backed up pilot revert-check -> revert-check.head84.jsonl"
fi

# wait for the mapper (single or sharded — pgrep matches both map-fix-commits*)
while pgrep -f map-fix-commits >/dev/null 2>&1; do
  echo "waiting for mapper: $(wc -l < "$DATA/fix-commits.jsonl")/1231"
  sleep 20
done
echo "mapper done: $(wc -l < "$DATA/fix-commits.jsonl") issues mapped"

# fan out read-only scan shards
echo "launching $K scan shards..."
pids=""
for i in $(seq 0 $((K-1))); do
  SHARD_IDX=$i SHARD_TOTAL=$K "$SC/check-clean-revert-shard.sh" \
    > "$DATA/logs/scan-shard-$i.log" 2>&1 &
  pids="$pids $!"
done
for p in $pids; do wait "$p"; done

# merge shards -> revert-check.jsonl (issue-descending), then summarize
cat "$DATA"/revert-check.shard-*.jsonl \
  | node -e '
const fs=require("fs");
const raw=fs.readFileSync(0,"utf8").trim().split("\n").filter(Boolean);
const lines=[]; let bad=0;
for(const l of raw){ try{ lines.push(JSON.parse(l)); }catch(e){ bad++; console.error("skip bad line:", l.slice(0,120)); } }
if(bad) console.log("WARN: skipped",bad,"unparseable line(s)");
lines.sort((a,b)=>b.issue-a.issue);
fs.writeFileSync(process.argv[1], lines.map(o=>JSON.stringify(o)).join("\n")+"\n");
const by={};for(const r of lines)by[r.status]=(by[r.status]||0)+1;
const clean=lines.filter(r=>r.status==="clean").map(r=>r.issue);
console.log("=== full-population revert-check complete ===");
console.log("total checked:",lines.length);
console.log("by status:",JSON.stringify(by));
console.log("clean-reverter issues ("+clean.length+"):",clean.join(" "));
' "$DATA/revert-check.jsonl"
rm -f "$DATA"/revert-check.shard-*.jsonl
echo "ALL DONE"

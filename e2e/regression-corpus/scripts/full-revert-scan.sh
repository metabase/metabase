#!/bin/bash
# Stage 1 (parallelized): wait for the (sharded) fix-commit mapper to finish, then
# classify EVERY mapped issue's clean-revert status over the full population using N
# concurrent read-only scan shards, merge, and summarize. Nothing mutates the tree.
set -u
cd "$(dirname "$0")/../.."
CORPUS="regression-corpus"; SC="$CORPUS/scripts"
K="${SCAN_SHARDS:-10}"

# preserve the pilot's 84-issue classification (idempotent)
if [ ! -f "$CORPUS/revert-check.head84.jsonl" ]; then
  cp "$CORPUS/revert-check.jsonl" "$CORPUS/revert-check.head84.jsonl"
  echo "backed up pilot revert-check -> revert-check.head84.jsonl"
fi

# wait for the mapper (single or sharded — pgrep matches both map-fix-commits*)
while pgrep -f map-fix-commits >/dev/null 2>&1; do
  echo "waiting for mapper: $(wc -l < "$CORPUS/fix-commits.jsonl")/1231"
  sleep 20
done
echo "mapper done: $(wc -l < "$CORPUS/fix-commits.jsonl") issues mapped"

# fan out read-only scan shards
echo "launching $K scan shards..."
pids=""
for i in $(seq 0 $((K-1))); do
  SHARD_IDX=$i SHARD_TOTAL=$K "$SC/check-clean-revert-shard.sh" \
    > "$CORPUS/logs/scan-shard-$i.log" 2>&1 &
  pids="$pids $!"
done
for p in $pids; do wait "$p"; done

# merge shards -> revert-check.jsonl (issue-descending), then summarize
cat "$CORPUS"/revert-check.shard-*.jsonl \
  | node -e '
const fs=require("fs");
const raw=fs.readFileSync(0,"utf8").trim().split("\n").filter(Boolean);
const lines=[]; let bad=0;
for(const l of raw){ try{ lines.push(JSON.parse(l)); }catch(e){ bad++; console.error("skip bad line:", l.slice(0,120)); } }
if(bad) console.log("WARN: skipped",bad,"unparseable line(s)");
lines.sort((a,b)=>b.issue-a.issue);
fs.writeFileSync("regression-corpus/revert-check.jsonl", lines.map(o=>JSON.stringify(o)).join("\n")+"\n");
const by={};for(const r of lines)by[r.status]=(by[r.status]||0)+1;
const clean=lines.filter(r=>r.status==="clean").map(r=>r.issue);
console.log("=== full-population revert-check complete ===");
console.log("total checked:",lines.length);
console.log("by status:",JSON.stringify(by));
console.log("clean-reverter issues ("+clean.length+"):",clean.join(" "));
'
rm -f "$CORPUS"/revert-check.shard-*.jsonl
echo "ALL DONE"

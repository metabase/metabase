#!/bin/bash
# Sharded copy of map-fix-commits.sh. Processes only the unmapped issues whose
# (issue % SHARD_TOTAL == SHARD_IDX), so N of these can run concurrently with no overlap.
# Single-line appends to fix-commits.jsonl are atomic (O_APPEND, line < 4096B).
# Usage: SHARD_IDX=<0..N-1> SHARD_TOTAL=<N> map-fix-commits-shard.sh
set -u
cd "$(dirname "$0")/../.."
OUT="regression-corpus/fix-commits.jsonl"
touch "$OUT"
: "${SHARD_IDX:?set SHARD_IDX}" "${SHARD_TOTAL:?set SHARD_TOTAL}"

issues=$(SHARD_IDX="$SHARD_IDX" SHARD_TOTAL="$SHARD_TOTAL" node -e '
const fs=require("fs");
const idx=+process.env.SHARD_IDX, total=+process.env.SHARD_TOTAL;
const done=new Set();
try{for(const l of fs.readFileSync("regression-corpus/fix-commits.jsonl","utf8").trim().split("\n"))if(l)done.add(JSON.parse(l).issue);}catch(e){}
const s=new Set();
for(const l of fs.readFileSync("regression-corpus/repro-tests.jsonl","utf8").trim().split("\n"))
  for(const i of JSON.parse(l).issues) s.add(i);
console.log([...s].filter(i=>!done.has(i) && (((i % total)+total)%total)===idx).sort((a,b)=>b-a).join("\n"));
')

for N in $issues; do
  pick=$(git log --format='%H|%as|%s' --pickaxe-regex \
    -S"(metabase#|[Ii]ssues? #?)${N}([^0-9]|\$)" master -- e2e | head -8)
  msg=$(git log --format='%H|%as|%s' -E -i \
    --grep="(fix(es|ed)?|close[sd]?|resolve[sd]?)[^0-9]*(metabase)?#?${N}([^0-9]|\$)" \
    master | head -3)
  node -e '
const [n, pick, msg] = process.argv.slice(1);
const parse = s => s ? s.trim().split("\n").filter(Boolean).map(l=>{const [hash,date,...r]=l.split("|");return {hash,date,subject:r.join("|")}}) : [];
console.log(JSON.stringify({issue:+n, introduced:parse(pick), msg_match:parse(msg)}));
' "$N" "$pick" "$msg" >> "$OUT"
done
echo "shard $SHARD_IDX/$SHARD_TOTAL done"

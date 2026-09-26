#!/bin/bash
# For each unique issue number in repro-tests.jsonl (descending, recent first), find the
# commit that INTRODUCED the repro test title (pickaxe over e2e/) — for fix PRs that add
# their repro test, this IS the fix commit. Message-grep is kept as corroboration only
# (Linear-era commits rarely cite issue numbers).
# Emits JSONL to fix-commits.jsonl: {issue, introduced[], msg_match[]}
#   introduced: commits where occurrence count of the title-ref changed (oldest last =
#   the introduction; later entries can be deletions/edits, e.g. PR #77163 removals)
set -u
cd "$(dirname "$0")/../.."
OUT="regression-corpus/fix-commits.jsonl"
touch "$OUT"

issues=$(node -e '
const fs=require("fs");
const done=new Set();
try{for(const l of fs.readFileSync("regression-corpus/fix-commits.jsonl","utf8").trim().split("\n"))if(l)done.add(JSON.parse(l).issue);}catch(e){}
const s=new Set();
for(const l of fs.readFileSync("regression-corpus/repro-tests.jsonl","utf8").trim().split("\n"))
  for(const i of JSON.parse(l).issues) s.add(i);
console.log([...s].filter(i=>!done.has(i)).sort((a,b)=>b-a).join("\n"));
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
echo "done: $(wc -l < "$OUT") issues mapped"

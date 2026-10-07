#!/usr/bin/env bash
# Runs jest and the node:test harness over the same spec files and reports
# wall time, CPU time and failures for each.
set -u
WORKERS=$(nproc)
OUT=${GITHUB_STEP_SUMMARY:-/dev/stdout}
LIST=$(mktemp)
JSON=$(mktemp --suffix=.json)
while read -r file; do [ -f "$file" ] && echo "$file"; done < node-test-spike/ci-files.txt > "$LIST"
node -e 'const fs=require("fs");const path=require("path");fs.writeFileSync(process.argv[2],JSON.stringify(fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map((f)=>path.resolve(f))))' "$LIST" "$JSON"

{
  echo "## jest against the node:test harness"
  echo
  echo "$(wc -l < "$LIST") spec files, $WORKERS workers, $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs), $(free -g | awk '/Mem:/{print $2}') GB"
  echo
  echo "| Round | Runner | Wall s | CPU s | Cores used | Result |"
  echo "|---|---|---|---|---|---|"
} >> "$OUT"

measure() {
  local round=$1 runner=$2 log timing result
  log=$(mktemp); timing=$(mktemp)
  if [ "$runner" = jest ]; then
    JEST_TEST_PATHS_FILE="$JSON" /usr/bin/time -f '%e %U %S' -o "$timing" \
      node_modules/.bin/jest --ignoreProjects ci-scripts --silent --maxWorkers="$WORKERS" > /dev/null 2> "$log"
    result=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -a '^Tests:' | head -1)
  else
    rm -f /tmp/harness.failures
    if [ "$runner" = "harness, isolated" ]; then export NT_ISOLATE_ALL=1 NT_SHARE_UI_PACKAGES=1; else unset NT_ISOLATE_ALL NT_SHARE_UI_PACKAGES; fi
    NT_FAILURES=/tmp/harness.failures /usr/bin/time -f '%e %U %S' -o "$timing" \
      node node-test-spike/pool.cjs "$LIST" "$WORKERS" > /dev/null 2> "$log"
    unset NT_ISOLATE_ALL NT_SHARE_UI_PACKAGES
    result="$(wc -l < /tmp/harness.failures 2>/dev/null || echo 0) failing tests in $(cut -f1 /tmp/harness.failures 2>/dev/null | sort -u | wc -l) files, $(grep -o '[0-9]* worker restarts' "$log" | tail -1)"
    cp /tmp/harness.failures "harness-failures-$round-${runner//[ ,]/}.tsv" 2>/dev/null
  fi
  tail -1 "$timing" | awk -v round="$round" -v runner="$runner" -v result="$result" \
    '{ printf "| %s | %s | %.1f | %.0f | %.1f | %s |\n", round, runner, $1, $2 + $3, ($2 + $3) / $1, result }' | tee -a "$OUT"
  tail -5 "$log"
}

measure 1 jest
measure 1 "harness, isolated"
measure 1 "harness, shared"
measure 2 "harness, isolated"

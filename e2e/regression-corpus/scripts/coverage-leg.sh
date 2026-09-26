#!/bin/bash
# Coverage leg: for each corpus entry, reintroduce the bug and run cheap suites.
#   FE: jest --findRelatedTests on the mutated files (tests that import them)
#   BE: ./bin/test-agent :module <module of mutated ns>
# Appends to coverage-results.jsonl; full logs in logs/<issue>-{fe,be}.log.
# Usage: coverage-leg.sh [issue ...]   (default: all bugs/ dirs except done/excluded)
#
# Mutation direction (matches HANDOFF): `git apply -R` mutates (reintroduce bug),
# forward `git apply` restores the fix. An EXIT trap force-restores the in-flight
# patch so a crash/kill never leaves the shared tree mutated.
set -u
cd "$(dirname "$0")/../.."
CORPUS="regression-corpus"
LOGS="$CORPUS/logs"; mkdir -p "$LOGS"
OUT="$CORPUS/coverage-results.jsonl"
SKIP="66670 70451"

# --- crash safety: restore whatever patch is currently applied ------------------
CUR_PATCH=""
restore_trap() {
  [ -n "$CUR_PATCH" ] || return 0
  if git apply "$CUR_PATCH" 2>/dev/null; then
    echo "trap: restored in-flight patch $CUR_PATCH" >&2
  else
    echo "trap: FAILED to restore $CUR_PATCH — TREE MAY BE MUTATED, fix manually" >&2
  fi
}
trap restore_trap EXIT

# Extract "N" from a "<label>: ... <N> <word> ..." jest/clojure summary fragment.
num_before() {  # num_before "<text>" "<word>"  -> first integer preceding <word>, or empty
  echo "$1" | grep -oE "[0-9]+ $2" | grep -oE '[0-9]+' | head -1
}

issues="${*:-$(ls "$CORPUS/bugs")}"

for issue in $issues; do
  case " $SKIP " in *" $issue "*) continue;; esac
  dir="$CORPUS/bugs/$issue"
  patch="$dir/inverse.patch"
  [ -f "$patch" ] || continue

  if ! git apply -R "$patch" 2>/dev/null; then
    echo "{\"issue\":$issue,\"status\":\"apply_failed\"}" >> "$OUT"
    continue
  fi
  CUR_PATCH="$patch"   # tree is now mutated; trap will restore if we die here

  files=$(grep '^diff --git' "$patch" | sed 's/^diff --git a\/\(.*\) b\/.*$/\1/')
  fe_files=$(echo "$files" | grep -E '^(frontend|enterprise/frontend)/src/.*\.(ts|tsx|js|jsx)$' || true)
  be_files=$(echo "$files" | grep -E '^(src|enterprise/backend/src)/.*\.(clj|cljc)$' || true)
  cljc_files=$(echo "$files" | grep -E '\.cljc$' || true)

  fe_exit=null; be_exit=null; be_module=null
  fe_failed=null; fe_total=null; be_failed=null; be_total=null
  if [ -n "$fe_files" ]; then
    npx jest --findRelatedTests $fe_files --passWithNoTests --silent \
      > "$LOGS/$issue-fe.log" 2>&1
    fe_exit=$?
    line=$(grep -E '^Tests:' "$LOGS/$issue-fe.log" | tail -1)
    if [ -n "$line" ]; then
      fe_total=$(num_before "$line" total); [ -z "$fe_total" ] && fe_total=null
      fe_failed=$(num_before "$line" failed); [ -z "$fe_failed" ] && fe_failed=0
    fi
  fi
  if [ -n "$be_files" ]; then
    first_be=$(echo "$be_files" | head -1)
    case "$first_be" in
      src/metabase/*) be_module=$(echo "$first_be" | cut -d/ -f3 | sed 's/\.clj.*//');;
      enterprise/backend/src/metabase_enterprise/*) be_module="enterprise/$(echo "$first_be" | cut -d/ -f5 | sed 's/\.clj.*//')";;
    esac
    if [ -n "$be_module" ] && [ "$be_module" != null ]; then
      ./bin/test-agent :module "$be_module" > "$LOGS/$issue-be.log" 2>&1
      be_exit=$?
      bline=$(grep -oE 'Ran [0-9]+ tests' "$LOGS/$issue-be.log" | tail -1)
      be_total=$(num_before "$bline" tests); [ -z "$be_total" ] && be_total=null
      sline=$(grep -oE '[0-9]+ failures?, [0-9]+ errors?' "$LOGS/$issue-be.log" | tail -1)
      if [ -n "$sline" ]; then
        f=$(num_before "$sline" 'failures?'); e=$(num_before "$sline" 'errors?')
        be_failed=$(( ${f:-0} + ${e:-0} ))
      fi
    fi
  fi

  if git apply "$patch" 2>/dev/null; then
    CUR_PATCH=""   # tree restored; nothing for the trap to do
  else
    echo "{\"issue\":$issue,\"status\":\"RESTORE_FAILED\"}" >> "$OUT"; exit 1
  fi

  n_fe=$(echo "$fe_files" | grep -c . || true); n_be=$(echo "$be_files" | grep -c . || true)
  cljc=false; [ -n "$cljc_files" ] && cljc=true
  echo "{\"issue\":$issue,\"status\":\"ok\",\"fe_files\":$n_fe,\"be_files\":$n_be,\"cljc\":$cljc,\"fe_exit\":$fe_exit,\"be_exit\":${be_exit:-null},\"be_module\":\"${be_module}\",\"fe_failed\":${fe_failed},\"fe_total\":${fe_total},\"be_failed\":${be_failed},\"be_total\":${be_total}}" >> "$OUT"
  echo "done $issue fe_exit=$fe_exit ($fe_failed/$fe_total failed) be_exit=${be_exit:-null} ($be_failed/$be_total failed)"
done
echo "ALL DONE"

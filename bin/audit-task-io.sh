#!/usr/bin/env bash
# Check that a moon task declares every file it writes.
#
# moon verifies that declared outputs exist after a run, but it does not notice a
# task writing files it never declared. An undeclared write means the cache does
# not carry that file, so a cache hit silently leaves it stale or missing.
#
# Usage: bin/audit-task-io.sh <task> [<task> ...]
#
# `moon run --force` re-runs a task's whole dependency chain, so writes made by a
# dependency would otherwise be blamed on the task under test. Anything a
# dependency legitimately produces (its own declared outputs) is subtracted.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

MOON="${MOON:-moon}"
PROJECT="${MOON_PROJECT:-metabase}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

snapshot() {
  find . -type f \
    -not -path './.git/*' \
    -not -path './node_modules/*' \
    -not -path './.moon/cache/*' \
    -exec stat -c '%Y %n' {} + 2>/dev/null | sort
}

# Declared outputs of a task and of everything it depends on, transitively.
declared_for() {
  "$MOON" task "$PROJECT:$1" --json 2>/dev/null | python3 -c '
import json, sys
t = json.load(sys.stdin)
t = t.get("task", t)
for o in t.get("outputs", []):
    print(o["glob"] if isinstance(o, dict) and "glob" in o else
          o["file"]  if isinstance(o, dict) and "file"  in o else o)
for d in t.get("deps", []):
    print("@dep:" + (d["target"] if isinstance(d, dict) else d))
'
}

collect_declared() {
  local task="$1" seen="$2"
  grep -qxF "$task" "$seen" 2>/dev/null && return
  echo "$task" >> "$seen"
  while read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      @dep:*) collect_declared "${line#@dep:}" "$seen" ;;
      *)      echo "$line" >> "$TMP/declared" ;;
    esac
  done < <(declared_for "${task##*:}")
}

status=0
for TASK in "$@"; do
  : > "$TMP/declared"; : > "$TMP/seen"
  collect_declared "$TASK" "$TMP/seen"
  sort -u "$TMP/declared" -o "$TMP/declared"

  "$MOON" run "$TASK" >/dev/null 2>&1          # warm, so the run below is the only variable
  snapshot > "$TMP/before"
  "$MOON" run "$TASK" --force >/dev/null 2>&1
  snapshot > "$TMP/after"

  comm -13 "$TMP/before" "$TMP/after" | awk '{print $2}' | sed 's|^\./||' | sort -u > "$TMP/written"

  : > "$TMP/undeclared"
  ALLOW=.moon/audit-allowlist.txt
  while read -r f; do
    [ -z "$f" ] && continue
    ok=0
    if [ -f "$ALLOW" ]; then
      while read -r a; do
        case "$a" in ''|\#*) continue ;; esac
        case "$f" in $a*) ok=1; break ;; esac
      done < "$ALLOW"
    fi
    [ "$ok" -eq 1 ] && continue
    while read -r d; do
      [ -z "$d" ] && continue
      d="${d#/}"
      case "$f" in ${d%/\*\*}*|$d) ok=1; break ;; esac
    done < "$TMP/declared"
    [ "$ok" -eq 0 ] && echo "$f" >> "$TMP/undeclared"
  done < "$TMP/written"

  n=$(grep -c . "$TMP/undeclared" || true); n=${n:-0}
  printf '%-44s wrote %4s  undeclared %s\n' "$TASK" "$(grep -c . "$TMP/written" || true)" "$n"
  if [ "$n" -gt 0 ]; then
    sed 's/^/    /' "$TMP/undeclared" | head -20
    status=1
  fi
done
exit $status

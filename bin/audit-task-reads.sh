#!/usr/bin/env bash
# Check that a moon task declares every file it reads.
#
# An undeclared input is the dangerous direction: the file is not in the cache
# key, so editing it leaves a stale cache hit in place and the task reports
# success against old content. Both input bugs found while writing this config
# were of that kind.
#
# Usage: bin/audit-task-reads.sh <task> [<task> ...]
#
# Requires strace, so this runs on Linux and in CI, not on macOS. An atime based
# fallback was tried and removed: on APFS the access times never moved for files
# a warm shadow-cljs read through its own cache, so it reported a clean pass
# having observed nothing. A check that cannot fail is worse than no check.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

if ! command -v strace >/dev/null 2>&1; then
  echo "strace not found. This audit needs it to see file reads." >&2
  echo "On macOS use the CI job (.github/workflows/moon-task-io.yml) instead:" >&2
  echo "  fs_usage needs sudo and dtrace is blocked by SIP, and the atime" >&2
  echo "  fallback silently observes nothing. See the comment in this script." >&2
  exit 2
fi

MOON="${MOON:-moon}"
PROJECT="${MOON_PROJECT:-metabase}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# node_modules and target are excluded: moon does not declare them and a build
# legitimately reads all over both. Everything else comes from the shared
# allowlist, which is where tool caches are recorded with a reason.
ALLOW=.moon/audit-allowlist.txt
interesting() {
  grep -vE '^(node_modules/|\.git/|\.moon/cache/|target/)' | grep -vE '^(/|\.\.)' | sort -u \
  | { if [ -f "$ALLOW" ]; then grep -vFf <(grep -vE '^\s*(#|$)' "$ALLOW"); else cat; fi; }
}

status=0
for TASK in "$@"; do
  "$MOON" task "$PROJECT:$TASK" --json 2>/dev/null \
    | python3 bin/moon-audit/expand-inputs.py | sort -u > "$TMP/declared"

  "$MOON" run "$TASK" >/dev/null 2>&1          # warm deps so only this task is cold
  strace -f -qq -e trace=openat,open -o "$TMP/trace" \
    "$MOON" run "$TASK" --force >/dev/null 2>&1
  grep -oE '"[^"]+"' "$TMP/trace" | tr -d '"' | sed "s|^$PWD/||" | interesting > "$TMP/read"

  read_n=$(grep -c . "$TMP/read" || true); read_n=${read_n:-0}
  # A task that read nothing means the trace failed, not that the task is clean.
  if [ "$read_n" -eq 0 ]; then
    printf '%-40s TRACE SAW NO READS - not reporting a pass\n' "$TASK"
    status=1
    continue
  fi

  comm -23 "$TMP/read" "$TMP/declared" > "$TMP/undeclared"
  n=$(grep -c . "$TMP/undeclared" || true); n=${n:-0}
  printf '%-40s read %5s  declared %5s  undeclared %s\n' \
    "$TASK" "$read_n" "$(grep -c . "$TMP/declared" || true)" "$n"
  if [ "$n" -gt 0 ]; then sed 's/^/    /' "$TMP/undeclared" | head -15; status=1; fi
done
exit $status

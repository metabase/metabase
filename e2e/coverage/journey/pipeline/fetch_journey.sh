#!/usr/bin/env bash
# Usage: e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>
# Downloads a journey-capture run's shard artifacts and its openapi.json into <run dir>.
# Shards that are already there are skipped, so an interrupted download can be resumed.
set -euo pipefail

RUN_ID="${1:?run id}"
RUN_DIR="${2:?run dir}"
REPO_SLUG="${REPO_SLUG:-metabase/metabase}"
mkdir -p "$RUN_DIR"

retry() {
  for attempt in 1 2 3 4 5; do
    "$@" && return 0
    echo "retrying ($attempt): $*" >&2
    sleep $((attempt * 5))
  done
  return 1
}

names="$(retry gh api --paginate "repos/$REPO_SLUG/actions/runs/$RUN_ID/artifacts?per_page=100" --jq '.artifacts[] | select(.expired | not) | .name')"
for name in $names; do
  case "$name" in
    journey-capture-shard-*)
      dir="$RUN_DIR/$name"
      [ -f "$dir/meta.json" ] && continue
      rm -rf "$dir"
      retry gh run download "$RUN_ID" --repo "$REPO_SLUG" -n "$name" -D "$dir"
      ;;
    journey-capture-openapi)
      [ -f "$RUN_DIR/$name/openapi.json" ] || retry gh run download "$RUN_ID" --repo "$REPO_SLUG" -n "$name" -D "$RUN_DIR/$name"
      ;;
    journey-capture-cljs)
      if [ -n "${WITH_CLJS:-}" ] && [ ! -d "$RUN_DIR/$name" ]; then
        retry gh run download "$RUN_ID" --repo "$REPO_SLUG" -n "$name" -D "$RUN_DIR/$name"
      fi
      ;;
  esac
done
echo "$(ls -d "$RUN_DIR"/journey-capture-shard-* 2>/dev/null | wc -l | tr -d ' ') shards in $RUN_DIR"

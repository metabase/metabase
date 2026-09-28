#!/usr/bin/env bash
# Usage: JOURNEY_AGE_IDENTITY=<age identity file> e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>
# Downloads a journey-capture run's shard artifacts and its openapi.json into <run dir>.
# Each shard artifact is decrypted with the identity into <run dir>/journey-capture-shard-<n>/.
# Shards that are already there are skipped, so an interrupted download can be resumed.
set -euo pipefail

RUN_ID="${1:?run id}"
RUN_DIR="${2:?run dir}"
REPO_SLUG="${REPO_SLUG:-metabase/metabase}"
if [ -z "${JOURNEY_AGE_IDENTITY:-}" ] || [ ! -f "$JOURNEY_AGE_IDENTITY" ]; then
  echo "JOURNEY_AGE_IDENTITY must name the age identity file for a key in e2e/journey-capture/age-recipients.txt" >&2
  exit 1
fi
if ! command -v age > /dev/null; then
  echo "age is not installed: https://github.com/FiloSottile/age#installation" >&2
  exit 1
fi
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
      download="$RUN_DIR/.download-$name"
      rm -rf "$dir" "$download"
      retry gh run download "$RUN_ID" --repo "$REPO_SLUG" -n "$name" -D "$download"
      mkdir -p "$dir"
      age --decrypt -i "$JOURNEY_AGE_IDENTITY" "$download/$name.tar.gz.age" | tar -xzf - -C "$dir"
      rm -rf "$download"
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

#!/usr/bin/env bash
# Usage: e2e/coverage/journey/pipeline/repo_files.sh <sha> <dest dir>
# Copies the repo files the analysis reads, at the capture's SHA, into <dest dir>.
# Reads from the local clone when it has the commit, and from the GitHub API otherwise.
set -euo pipefail

SHA="${1:?sha}"
DEST="${2:?dest dir}"
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
REPO_SLUG="${REPO_SLUG:-metabase/metabase}"

for f in \
  frontend/lint/module-boundaries.mjs \
  frontend/lint/shared-tiers.mjs \
  src/metabase/api_routes/routes.clj \
  enterprise/backend/src/metabase_enterprise/api_routes/routes.clj \
  .clj-kondo/config/modules/config.edn; do
  mkdir -p "$DEST/$(dirname "$f")"
  [ -s "$DEST/$f" ] && continue
  if ! git -C "$REPO" show "$SHA:$f" > "$DEST/$f" 2>/dev/null; then
    gh api -H "Accept: application/vnd.github.raw" "repos/$REPO_SLUG/contents/$f?ref=$SHA" > "$DEST/$f"
  fi
done

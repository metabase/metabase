#!/usr/bin/env bash
# Lazily regenerates the gitignored docs artifacts that the Astro build
# depends on (typedoc snippets, OpenAPI spec). Skips the regen if the files
# are already present — fast steady-state, bootstrap on first run.
#
# To force a fresh regen, delete the files (or run the underlying scripts
# directly):
#   ./bin/generate-embedding-docs.sh --pure
#   ./bin/generate-docs.sh --api

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f docs/embedding/sdk/api/snippets/index.md ]; then
  echo "→ embedding docs missing, generating (typedoc --pure)..."
  ./bin/generate-embedding-docs.sh --pure
fi

if [ ! -f docs-build/public/embedding/sdk/api/index.html ]; then
  echo "→ embedding HTML API reference missing, generating..."
  bun run embedding-sdk:docs:generate:html:pure
fi

if [ ! -f docs/api.json ]; then
  echo "→ OpenAPI spec missing, generating..."
  ./bin/generate-docs.sh --api
fi

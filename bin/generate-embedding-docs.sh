#!/usr/bin/env bash
# Generates the auto-derived embedding docs that ship with the Astro build:
#   - docs/embedding/sdk/api/         (React SDK API reference)
#   - docs/embedding/eajs/snippets/   (embed.js web-component attributes)
#
# Generation is expensive (the SDK package is built so typedoc has type
# definitions to read). Run this only when SDK or EAJS types change, then
# commit the diff alongside the type change.
#
# Flags:
#   --pure    Skip rebuilding the SDK package (typedoc-only). Use when the SDK
#             d.ts files in resources/embedding-sdk/dist are already current.

set -euo pipefail

cd "$(dirname "$0")/.."

mode="full"
for arg in "$@"; do
  case "$arg" in
    --pure) mode="pure" ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Usage: $0 [--pure]" >&2
      exit 1
      ;;
  esac
done

if [ "$mode" = "pure" ]; then
  echo "Generating embedding docs (typedoc only)..."
  bun run embedding-sdk:docs:generate:pure
else
  echo "Generating embedding docs (full SDK build + typedoc)..."
  bun run embedding-sdk:docs:generate
fi

bun run embedding-eajs:docs:generate

echo "Generating embedding HTML API reference..."
bun run embedding-sdk:docs:generate:html:pure

cat <<'EOF'

✓ Embedding docs generated.

If files changed, commit them alongside your type change:
    docs/embedding/sdk/api/
    docs/embedding/eajs/snippets/

The HTML API reference under docs-build/public/embedding/sdk/api/ is
gitignored and regenerated on every build.
EOF

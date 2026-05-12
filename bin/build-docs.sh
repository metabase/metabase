#!/usr/bin/env bash
# Builds the Astro docs site at docs-build/dist/.
#
# Configure with environment variables:
#   DOCS_BASE_PATH   URL prefix (default: /docs/latest, or /docs/v0.NN inferred
#                    from a release-x.NN.x branch)
#   DOCS_SITE_URL    Absolute site URL for canonical/sitemap (default: metabase.com)

set -euo pipefail

cd "$(dirname "$0")/.."
repo_root="$(pwd)"

base="${DOCS_BASE_PATH:-}"
if [ -z "$base" ]; then
  branch="${GITHUB_REF_NAME:-}"
  if [ -z "$branch" ]; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo)"
  fi
  case "$branch" in
    release-x.*.x)
      ver="${branch#release-x.}"
      ver="${ver%.x}"
      base="/docs/v0.${ver}"
      ;;
    *)
      base="/docs/latest"
      ;;
  esac
fi

echo "Building docs site"
echo "  repo:     $repo_root"
echo "  base:     $base"

# Regenerate the gitignored source-of-truth content (typedoc snippets,
# OpenAPI spec) before building. Full mode here — CI has no built SDK, and
# local `docs:build` is the explicit "I want the full clean build" command.
echo "Regenerating embedding docs..."
"$repo_root/bin/generate-embedding-docs.sh"
echo "Regenerating OpenAPI spec..."
"$repo_root/bin/generate-docs.sh" --api

cd "$repo_root/docs-build"
if [ -f bun.lockb ] || [ -f bun.lock ]; then
  bun install --frozen-lockfile
else
  bun install
fi

# Clear content store so plugin/markdown changes always take effect.
# Astro caches processed markdown in node_modules/.astro/data-store.json
# keyed by source mtime; plugin source changes don't invalidate it.
rm -rf .astro node_modules/.astro dist

DOCS_BASE_PATH="$base" bun run build

echo "Generating llms.txt artifacts"
DOCS_BASE_PATH="$base" node scripts/generate-llms-files.mjs

echo "Output: $repo_root/docs-build/dist (base path: $base)"

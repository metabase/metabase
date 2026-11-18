#!/usr/bin/env bash
# Reads the @metabase/ui version and prints version, npm_tag (latest|next) and git_tag
# as key=value lines. Accepts X.Y.Z (latest) or X.Y.Z-<id>.N (next).
# Use: ./bin/ui-package/resolve-release.sh | tee -a "$GITHUB_OUTPUT"
set -euo pipefail

PKG="${UI_PACKAGE_PKG:-frontend/ui-package/package.json}"

if [ ! -f "$PKG" ]; then
  echo "package.json not found at $PKG" >&2
  exit 1
fi

VERSION=$(jq -r '.version // ""' "$PKG")
if [ -z "$VERSION" ]; then
  echo "version missing from $PKG" >&2
  exit 1
fi

if [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NPM_TAG="latest"
elif [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z]+\.[0-9]+$ ]]; then
  NPM_TAG="next"
else
  echo "version '$VERSION' in $PKG must be X.Y.Z or X.Y.Z-<id>.N (e.g. 0.2.0-beta.1)" >&2
  exit 1
fi

echo "version=$VERSION"
echo "npm_tag=$NPM_TAG"
echo "git_tag=ui-package-v$VERSION"

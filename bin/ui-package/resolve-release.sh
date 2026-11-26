#!/usr/bin/env bash
# Reads the version from the @metabase/ui package.json and derives the npm
# dist-tag. Prints three key=value lines to stdout:
#
#   version=X.Y.Z[-canary.N]
#   npm_tag=latest|canary
#   git_tag=ui-v<version>
#
# Only two versioning shapes are accepted:
#   0.1.0            → latest
#   0.1.0-canary.5   → canary
#
# Intended for use from the release workflow:
#
#   ./bin/ui-package/resolve-release.sh | tee -a "$GITHUB_OUTPUT"
#
# Run standalone to preview what the workflow will resolve.
set -euo pipefail

PKG="${UI_PACKAGE_JSON:-frontend/ui-package/package.json}"

if [ ! -f "$PKG" ]; then
  echo "package.json not found at $PKG" >&2
  exit 1
fi

VERSION=$(jq -r '.version // ""' "$PKG")
if [ -z "$VERSION" ]; then
  echo "version missing from $PKG" >&2
  exit 1
fi

NUM='(0|[1-9][0-9]*)'
if [[ "$VERSION" =~ ^$NUM\.$NUM\.$NUM$ ]]; then
  NPM_TAG="latest"
elif [[ "$VERSION" =~ ^$NUM\.$NUM\.$NUM-canary\.$NUM$ ]]; then
  NPM_TAG="canary"
else
  echo "version '$VERSION' in $PKG must be X.Y.Z or X.Y.Z-canary.N" >&2
  exit 1
fi

echo "version=$VERSION"
echo "npm_tag=$NPM_TAG"
echo "git_tag=ui-v$VERSION"

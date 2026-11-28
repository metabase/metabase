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

# Validate before Bash command substitution can discard newlines or NULs.
NUM='(0|[1-9][0-9]*)'
PATTERN="\A(?<major>$NUM)\.(?<minor>$NUM)\.(?<patch>$NUM)(-canary\.$NUM)?\z"
# A loose Git tag lock file adds nine bytes: ui-v<version>.lock.
MAX_VERSION_LENGTH=$((255 - 9))
if ! VERSION=$(jq -ers --arg pattern "$PATTERN" --argjson max_length "$MAX_VERSION_LENGTH" '
  select(length == 1) | .[0].version
  | select(type == "string" and length <= $max_length)
  | select(capture($pattern) | [.major, .minor, .patch] | all(tonumber < 9007199254740992))
' "$PKG"); then
  echo "version in $PKG must be an npm-compatible X.Y.Z or X.Y.Z-canary.N" >&2
  exit 1
fi

case "$VERSION" in
  *-canary.*) NPM_TAG="canary" ;;
  *) NPM_TAG="latest" ;;
esac

echo "version=$VERSION"
echo "npm_tag=$NPM_TAG"
echo "git_tag=ui-v$VERSION"

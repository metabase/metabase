#!/usr/bin/env bash
# Reads version from the @metabase/custom-viz package.json, validates it
# against the release branch, and derives the npm dist-tag + git tags.
# Prints key=value lines to stdout (suitable for $GITHUB_OUTPUT):
#
#   version=<version>
#   npm_tag=<canary|NN-stable>
#   git_tag=custom-viz-v<version>
#   stable_tag=<custom-viz-NN-stable|>           # empty unless release-branch stable
#
# Version shape is `0.<MB-major>.<patch>[-canary.K]`, loosely following the
# embedding-sdk convention but with only two channels: canary + stable.
#
#   branch               | allowed version                | npm_tag
#   ---------------------+--------------------------------+-------------
#   master               | 0.NN.0-canary.K                | canary
#   release-x.NN.x       | 0.NN.M                         | NN-stable
#
# `latest` is never pushed automatically. It is promoted manually once a
# release-x.NN.x branch reaches gold:
#   npm dist-tag add @metabase/custom-viz@<version> latest
#
# Required env:
#   BRANCH         branch the release is being cut from (master|release-x.NN.x)
# Optional env:
#   CUSTOM_VIZ_PKG path to package.json (for tests); defaults to the repo copy.
#
# Usage (from release workflow):
#   BRANCH="$INPUT_BRANCH" ./bin/custom-viz/resolve-release.sh | tee -a "$GITHUB_OUTPUT"
#
# Standalone (preview what the workflow will resolve):
#   BRANCH=master ./bin/custom-viz/resolve-release.sh
set -euo pipefail

PKG="${CUSTOM_VIZ_PKG:-enterprise/frontend/src/custom-viz/package.json}"
BRANCH="${BRANCH:-}"

if [ -z "$BRANCH" ]; then
  echo "BRANCH env var is required (master or release-x.NN.x)" >&2
  exit 1
fi

if [ ! -f "$PKG" ]; then
  echo "package.json not found at $PKG" >&2
  exit 1
fi

VERSION=$(jq -r '.version // ""' "$PKG")
if [ -z "$VERSION" ]; then
  echo "version missing from $PKG" >&2
  exit 1
fi

BASE="${VERSION%%-*}"
if [ "$BASE" = "$VERSION" ]; then
  SUFFIX=""
else
  SUFFIX="${VERSION#*-}"
fi

if ! [[ "$BASE" =~ ^0\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "version '$VERSION' in $PKG must match 0.NN.M[-canary.K] (got base '$BASE')" >&2
  exit 1
fi
PKG_MAJOR="${BASH_REMATCH[1]}"
PKG_PATCH="${BASH_REMATCH[2]}"

if [ "$BRANCH" = "master" ]; then
  if ! [[ "$SUFFIX" =~ ^canary\.[0-9]+$ ]]; then
    echo "version '$VERSION' on master must end with -canary.K (got suffix '${SUFFIX:-<none>}')" >&2
    exit 1
  fi
  if [ "$PKG_PATCH" != "0" ]; then
    echo "version '$VERSION' on master must have patch 0 (got $PKG_PATCH)" >&2
    exit 1
  fi
  NPM_TAG="canary"
  STABLE_TAG=""
elif [[ "$BRANCH" =~ ^release-x\.([0-9]+)\.x$ ]]; then
  BRANCH_MAJOR="${BASH_REMATCH[1]}"
  if [ "$PKG_MAJOR" != "$BRANCH_MAJOR" ]; then
    echo "version '$VERSION' targets major $PKG_MAJOR but branch '$BRANCH' is for major $BRANCH_MAJOR" >&2
    exit 1
  fi
  if [ -n "$SUFFIX" ]; then
    echo "version '$VERSION' on release branch must be a clean 0.NN.M (got suffix '$SUFFIX')" >&2
    exit 1
  fi
  NPM_TAG="${BRANCH_MAJOR}-stable"
  STABLE_TAG="custom-viz-${BRANCH_MAJOR}-stable"
else
  echo "branch '$BRANCH' is not supported: expected 'master' or 'release-x.NN.x'" >&2
  exit 1
fi

echo "version=$VERSION"
echo "npm_tag=$NPM_TAG"
echo "git_tag=custom-viz-v$VERSION"
echo "stable_tag=$STABLE_TAG"

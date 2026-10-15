#!/usr/bin/env bash
set -euo pipefail

major="${1:?Usage: $0 MAJOR}"
grace_days="${PENDING_BACKPORT_GRACE_DAYS:-3}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

git_() { git -C "$repo_root" "$@"; }

changeset_ids() {
  { git_ grep -hoE "^[[:space:]]*id:[[:space:]]*['\"]?v${major}\.[^'\"[:space:]]+" "$@" -- resources/migrations || true; } |
    sed -E "s/^[[:space:]]*id:[[:space:]]*['\"]?//" | sort -u
}

latest_release_tag() {
  git_ ls-remote --tags --refs origin "v0.${major}.*" |
    awk '{print $2}' | sed 's|^refs/tags/||' |
    grep -E "^v0\.${major}\.[0-9]+(\.[0-9]+)?(-beta)?$" | sort -V | tail -1
}

tag="${RELEASE_TAG:-$(latest_release_tag)}"
if [[ -z "$tag" ]]; then
  echo "No release of v${major} found" >&2
  exit 1
fi

git_ fetch -q --depth=1 --no-tags origin \
  "+refs/tags/${tag}:refs/cross-version/release" \
  "+refs/heads/${RELEASE_BRANCH:-release-x.${major}.x}:refs/cross-version/branch"

pending=$(comm -23 <(changeset_ids) <(changeset_ids refs/cross-version/release))
[[ -z "$pending" ]] && exit 0

on_branch=$(changeset_ids refs/cross-version/branch)

git_ fetch -q --no-tags --shallow-since="${grace_days} days ago" origin \
  "+refs/heads/master:refs/cross-version/master" 2>/dev/null || true

while IFS= read -r id; do
  if grep -qxF "$id" <<<"$on_branch"; then
    echo "$id awaiting-release"
  elif [[ -n "$(git_ log --since="${grace_days} days ago" -S "$id" --format=%H refs/cross-version/master -- resources/migrations 2>/dev/null)" ]]; then
    echo "$id awaiting-backport"
  else
    echo "$id missing"
  fi
done <<<"$pending"

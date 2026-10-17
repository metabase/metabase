#!/usr/bin/env bash
#
# Finds out if a downgrade fails because master has a migration for an already released version.
#
# Example: master is on v66, and someone adds a v63 changeset to master. The cross-version test
# downgrades from master, so the app DB has the new v63 changeset. The v1.63.x image that the test
# downgrades to does not have that changeset yet, so it cannot roll it back and the downgrade fails.
# This is expected until a v63 release has the changeset.
#
# Usage:
#   ./pending-changesets.sh MAJOR
#
# The script compares the vMAJOR changesets on master with the latest vMAJOR release tag and with
# release-x.MAJOR.x. For each changeset that the release does not have, it prints "<id> <state>":
#
#   awaiting-release   The release branch has it. The next release will have it too.
#   awaiting-backport  The release branch does not have it, and it was added to master in the grace period.
#   missing            The release branch does not have it, and it was added to master before the grace period.
#
# The grace period gives the backport PR time to merge. PENDING_BACKPORT_GRACE_DAYS sets it (default: 3).
# The script gets the master history for that time span and uses `git log -S <id>` to find the commit
# that added the changeset. If no commit in that span added it, the changeset has been on master for
# longer than the grace period without a backport, so the state is "missing". test.sh skips the test for
# awaiting-release and awaiting-backport, and fails it for missing. This way a changeset that nobody
# backports cannot be skipped forever.
#
# RELEASE_TAG and RELEASE_BRANCH override the release tag and branch, to test the script.

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

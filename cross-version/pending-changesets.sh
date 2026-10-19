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
# The script compares the vMAJOR changesets on master with the latest vMAJOR release tag. For each
# changeset that the release does not have, it prints "<id> <state> <file>". <file> is the migration
# file on master. The state comes from the time that the changeset has been on master:
#
#   recent    Less than PENDING_NOTIFY_DAYS (default: 2).
#   overdue   PENDING_NOTIFY_DAYS or more, but less than PENDING_FAIL_DAYS (default: 3).
#   expired   PENDING_FAIL_DAYS or more.
#
# The script gets the master history for PENDING_FAIL_DAYS and uses `git log -S <id>` to find the commit
# that added the changeset. If no commit in that span added it, the state is "expired". test.sh skips the
# test for recent and overdue, and fails it for expired. cross-version.yml sends a Slack message for
# overdue. This way a changeset that no release has cannot be skipped forever.
#
# RELEASE_TAG overrides the release tag, to test the script.

set -euo pipefail

major="${1:?Usage: $0 MAJOR}"
notify_days="${PENDING_NOTIFY_DAYS:-2}"
fail_days="${PENDING_FAIL_DAYS:-3}"
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

release_depth=() master_depth=()
if [[ "$(git_ rev-parse --is-shallow-repository)" == "true" ]]; then
  release_depth=(--depth=1)
  master_depth=(--shallow-since="${fail_days} days ago")
fi

git_ fetch -q ${release_depth[@]+"${release_depth[@]}"} --no-tags origin "+refs/tags/${tag}:refs/cross-version/release"

pending=$(comm -23 <(changeset_ids) <(changeset_ids refs/cross-version/release))
[[ -z "$pending" ]] && exit 0

git_ fetch -q ${master_depth[@]+"${master_depth[@]}"} --no-tags origin "+refs/heads/master:refs/cross-version/master"
if [[ ${#master_depth[@]} -gt 0 ]]; then
  git_ fetch -q --deepen=1 --no-tags origin "+refs/heads/master:refs/cross-version/master"
fi

now=$(date +%s)
while IFS= read -r id; do
  file=$(git_ grep -lE "^[[:space:]]*id:[[:space:]]*['\"]?${id//./\\.}['\"]?[[:space:]]*$" -- resources/migrations | head -1 || true)
  added=$(git_ -c log.showRoot=false log --since="${fail_days} days ago" -S "$id" --format=%ct refs/cross-version/master -- resources/migrations 2>/dev/null | tail -1 || true)
  if [[ -z "$added" ]]; then
    state=expired
  elif (( now - added >= notify_days * 86400 )); then
    state=overdue
  else
    state=recent
  fi
  echo "$id $state $file"
done <<<"$pending"

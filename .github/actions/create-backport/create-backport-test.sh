#!/usr/bin/env bash

set -euo pipefail

# shellcheck source=.github/actions/create-backport/kondo-ratchets.sh
source "$(dirname "$0")/kondo-ratchets.sh"

test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT

disabled_ratchets=';; Kondo ignore ratchets apply only to master; this release branch opts out.
;; The test and fixer recognize this explicit opt-out.
{:disabled true}'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local expected=$1
  local actual=$2
  local message=$3
  [ "$expected" = "$actual" ] || fail "$message (expected '$expected', got '$actual')"
}

init_repo() {
  local repo=$1
  git init -q -b release "$repo"
  git -C "$repo" config user.email test@example.com
  git -C "$repo" config user.name "Backport test"
  printf 'base\n' > "$repo/app.txt"
  mkdir -p "$repo/.clj-kondo"
  printf '{:ignore-counts {:example 1}}\n' > "$repo/.clj-kondo/ratchets.edn"
  git -C "$repo" add .
  git -C "$repo" commit -qm "Base"
}

feature_commit() {
  local repo=$1
  shift
  git -C "$repo" checkout -qb feature
  "$@" "$repo"
  git -C "$repo" add .
  git -C "$repo" commit -qm "Feature"
  git -C "$repo" rev-parse HEAD
}

change_app() {
  printf 'feature\n' > "$1/app.txt"
}

change_ratchets() {
  printf '{:ignore-counts {:example 2}}\n' > "$1/.clj-kondo/ratchets.edn"
}

change_app_and_ratchets() {
  change_app "$1"
  change_ratchets "$1"
}

test_unrelated_commit() (
  local repo="$test_root/unrelated"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_app)
  git -C "$repo" checkout -q release

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_eq '{:ignore-counts {:example 1}}' "$(cat .clj-kondo/ratchets.edn)" \
    "an unrelated backport changed the ratchets"
  [ -z "$(git status --porcelain)" ] || fail "an unrelated backport left changes"
)

test_clean_ratchet_commit() (
  local repo="$test_root/clean-ratchet"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_ratchets)
  git -C "$repo" checkout -q release

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_eq "$disabled_ratchets" "$(cat .clj-kondo/ratchets.edn)" \
    "a clean ratchet backport did not install the release opt-out"
  [ -z "$(git status --porcelain)" ] || fail "a clean ratchet backport left changes"
)

test_ratchet_only_conflict() (
  local repo="$test_root/ratchet-conflict"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_ratchets)
  git -C "$repo" checkout -q release
  printf '{:ignore-counts {:release 1}}\n' > "$repo/.clj-kondo/ratchets.edn"
  git -C "$repo" commit -qam "Release change"

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_eq "$disabled_ratchets" "$(cat .clj-kondo/ratchets.edn)" \
    "a ratchet-only conflict did not install the release opt-out"
  ! git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null || fail "the cherry-pick was not completed"
  [ -z "$(git status --porcelain)" ] || fail "a resolved ratchet-only conflict left changes"
)

test_other_conflict_remains_manual() (
  local repo="$test_root/other-conflict"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_app_and_ratchets)
  git -C "$repo" checkout -q release
  printf 'release\n' > "$repo/app.txt"
  printf '{:ignore-counts {:release 1}}\n' > "$repo/.clj-kondo/ratchets.edn"
  git -C "$repo" commit -qam "Release changes"

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_eq "$disabled_ratchets" "$(cat .clj-kondo/ratchets.edn)" \
    "a mixed conflict did not resolve the ratchets"
  assert_eq 'app.txt' "$(git ls-files -u | awk '{print $4}' | sort -u)" \
    "the wrong conflicts remained unresolved"
  git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null || fail "the manual cherry-pick state was lost"
)

test_invalid_commit_fails() (
  local repo="$test_root/invalid"
  init_repo "$repo"
  cd "$repo"

  if cherry_pick_backport deadbeef; then
    fail "an invalid commit succeeded"
  fi
)

test_manual_script_is_self_contained() (
  local repo="$test_root/manual-script"
  init_repo "$repo"
  cd "$repo"

  write_backport_script abc123

  bash -n backport.sh
  grep -Fq 'disable_ratchets ()' backport.sh || fail "manual script omitted disable_ratchets"
  grep -Fq 'cherry_pick_backport ()' backport.sh || fail "manual script omitted cherry_pick_backport"
  grep -Fq 'cherry_pick_backport abc123' backport.sh || fail "manual script omitted the commit"
)

tests=(test_unrelated_commit
       test_clean_ratchet_commit
       test_ratchet_only_conflict
       test_other_conflict_remains_manual
       test_invalid_commit_fails
       test_manual_script_is_self_contained)

for test in "${tests[@]}"; do
  "$test"
  echo "PASS: $test"
done

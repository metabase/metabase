#!/usr/bin/env bash

set -euo pipefail

action_dir=$(cd "$(dirname "$0")" && pwd)
cut_release_workflow="$action_dir/../../workflows/cut-release-branch.yml"

# shellcheck source=.github/actions/create-backport/kondo-ratchets.sh
source "$action_dir/kondo-ratchets.sh"

# Any editor launch fails the run, so a continuation that waits on an editor cannot pass.
export GIT_EDITOR=false

test_root=
trap '[ -z "$test_root" ] || rm -rf -- "$test_root"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
test_root=$(mktemp -d)

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

# Sets up a release branch whose ratchets conflict with the feature commit, and prints that commit.
conflicting_ratchet_commit() {
  local repo=$1
  local commit
  commit=$(feature_commit "$repo" change_ratchets)
  git -C "$repo" checkout -q release
  printf '{:ignore-counts {:release 1}}\n' > "$repo/.clj-kondo/ratchets.edn"
  git -C "$repo" commit -qam "Release change"
  echo "$commit"
}

test_ratchet_only_conflict() (
  local repo="$test_root/ratchet-conflict"
  init_repo "$repo"
  local commit
  commit=$(conflicting_ratchet_commit "$repo")

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_eq "$disabled_ratchets" "$(cat .clj-kondo/ratchets.edn)" \
    "a ratchet-only conflict did not install the release opt-out"
  ! git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null || fail "the cherry-pick was not completed"
  [ -z "$(git status --porcelain)" ] || fail "a resolved ratchet-only conflict left changes"
)

test_continuation_never_opens_an_editor() (
  local repo="$test_root/editor"
  init_repo "$repo"
  local commit
  commit=$(conflicting_ratchet_commit "$repo")

  cd "$repo"
  # Git only opens an editor for the continuation when stdin is a terminal, so run it on a pty. The
  # exported GIT_EDITOR=false turns any editor launch into a failure.
  python3 -c 'import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))' \
    bash -c 'source "$1/kondo-ratchets.sh" && cherry_pick_backport "$2"' bash "$action_dir" "$commit" >/dev/null ||
    fail "the cherry-pick continuation opened an editor"

  assert_eq "$disabled_ratchets" "$(cat .clj-kondo/ratchets.edn)" \
    "the continuation did not install the release opt-out"
  ! git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null || fail "the cherry-pick was not completed"
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

test_release_cut_matches_backport() (
  local cut_repo="$test_root/release-cut"
  init_repo "$cut_repo"
  cd "$cut_repo"
  git checkout -qb release-x.99.x
  write_disabled_ratchets
  git add --sparse .clj-kondo/ratchets.edn
  git commit -q --allow-empty --no-verify -m "Cut release-x.99.x branch"
  git show HEAD:.clj-kondo/ratchets.edn > "$test_root/release-cut.edn"

  local backport_repo="$test_root/release-cut-backport"
  init_repo "$backport_repo"
  local commit
  commit=$(feature_commit "$backport_repo" change_ratchets)
  git -C "$backport_repo" checkout -q release
  cd "$backport_repo"
  cherry_pick_backport "$commit"
  git show HEAD:.clj-kondo/ratchets.edn > "$test_root/backport.edn"

  cmp -s "$test_root/release-cut.edn" "$test_root/backport.edn" ||
    fail "the release cut and the backport committed different opt-out files"
  assert_eq "$disabled_ratchets" "$(cat "$test_root/release-cut.edn")" \
    "the release cut did not install the expected opt-out"
)

test_cut_release_workflow_uses_the_producer() (
  grep -Fq 'source .github/actions/create-backport/kondo-ratchets.sh' "$cut_release_workflow" ||
    fail "the cut-release workflow does not source kondo-ratchets.sh"
  grep -Fq 'write_disabled_ratchets' "$cut_release_workflow" ||
    fail "the cut-release workflow does not call write_disabled_ratchets"
  ! grep -Fq ':disabled' "$cut_release_workflow" ||
    fail "the cut-release workflow carries its own copy of the opt-out"
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
  grep -Fq 'write_disabled_ratchets ()' backport.sh || fail "manual script omitted write_disabled_ratchets"
  grep -Fq 'disable_ratchets ()' backport.sh || fail "manual script omitted disable_ratchets"
  grep -Fq 'cherry_pick_backport ()' backport.sh || fail "manual script omitted cherry_pick_backport"
  grep -Fq 'cherry_pick_backport abc123' backport.sh || fail "manual script omitted the commit"
)

tests=(test_unrelated_commit
       test_clean_ratchet_commit
       test_ratchet_only_conflict
       test_continuation_never_opens_an_editor
       test_other_conflict_remains_manual
       test_release_cut_matches_backport
       test_cut_release_workflow_uses_the_producer
       test_invalid_commit_fails
       test_manual_script_is_self_contained)

for test in "${tests[@]}"; do
  "$test"
  echo "PASS: $test"
done

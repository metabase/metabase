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

active_ratchets='{:ignore-counts {:example 1}}'
disabled_ratchets=';; Kondo ignore ratchets apply only to master; this release branch opts out.
;; The test and fixer recognize this explicit opt-out.
{:disabled true}'

# Coverage:
#
# Target state       Incoming change       Other conflict   Expected result
# -----------------  --------------------  ---------------  ------------------------------------------
# active ratchets    unrelated file        none             leave ratchets unchanged
# active ratchets    ratchets              none             install the release opt-out
# disabled ratchets  ratchets              none             keep the opt-out; finish with an empty commit
# divergent ratchets ratchets              none             resolve ratchets and finish the cherry-pick
# divergent ratchets ratchets (on a pty)   none             finish without opening an editor
# active ratchets    unrelated file        app.txt          leave the conflict for manual resolution
# divergent ratchets ratchets + app.txt    app.txt          resolve only ratchets
# release cut        ratchets              none             cut and backport commit the same opt-out
# n/a                cut-release workflow  n/a              the workflow calls the shared writer
# any                invalid commit        n/a              propagate the cherry-pick failure
# divergent ratchets generated backport.sh app.txt          resolve only ratchets through the manual script
#
# Known gaps: an older target with no ratchets file, and an incoming commit that
# deletes the ratchets file.

test_unrelated_backport_preserves_target_ratchets() (
  local repo="$test_root/unrelated"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_app)
  git -C "$repo" checkout -q release

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_eq feature "$(cat app.txt)" "the unrelated change was not cherry-picked"
  assert_ratchets "$active_ratchets"
  assert_cherry_pick_completed
  assert_worktree_clean
)

test_clean_ratchet_backport_installs_release_opt_out() (
  local repo="$test_root/clean-ratchet"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_ratchets)
  git -C "$repo" checkout -q release

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_ratchets_disabled
  assert_cherry_pick_completed
  assert_worktree_clean
)

test_disabled_release_absorbs_ratchet_only_backport() (
  local repo="$test_root/disabled-release"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_ratchets)
  git -C "$repo" checkout -q release
  commit_release_change "$repo" disable_release_ratchets "Disable release ratchets"

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_ratchets_disabled
  assert_cherry_pick_completed
  assert_empty_commit
  assert_worktree_clean
)

test_ratchet_only_conflict_is_resolved() (
  local repo="$test_root/ratchet-conflict"
  init_repo "$repo"
  local commit
  commit=$(conflicting_ratchet_commit "$repo")

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_ratchets_disabled
  assert_cherry_pick_completed
  assert_worktree_clean
)

test_continuation_never_opens_an_editor() (
  local repo="$test_root/editor"
  init_repo "$repo"
  local commit
  commit=$(conflicting_ratchet_commit "$repo")

  cd "$repo"
  # Git only opens an editor for the continuation when stdin is a terminal, so run it on a pty. The
  # exported GIT_EDITOR=false turns any editor launch into a failure. The single quotes are deliberate:
  # $1 and $2 are for the inner bash, not this shell.
  # shellcheck disable=SC2016
  python3 -c 'import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))' \
    bash -c 'source "$1/kondo-ratchets.sh" && cherry_pick_backport "$2"' bash "$action_dir" "$commit" >/dev/null ||
    fail "the cherry-pick continuation opened an editor"

  assert_ratchets_disabled
  assert_cherry_pick_completed
)

test_non_ratchet_conflict_remains_manual() (
  local repo="$test_root/non-ratchet-conflict"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_app)
  git -C "$repo" checkout -q release
  commit_release_change "$repo" change_release_app "Change release app"

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_ratchets "$active_ratchets"
  assert_only_conflicts app.txt
  assert_cherry_pick_pending
)

test_mixed_conflict_resolves_only_ratchets() (
  local repo="$test_root/mixed-conflict"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_app_and_ratchets)
  git -C "$repo" checkout -q release
  commit_release_change "$repo" change_release_app_and_ratchets "Change release app and ratchets"

  cd "$repo"
  cherry_pick_backport "$commit"

  assert_ratchets_disabled
  assert_only_conflicts app.txt
  assert_cherry_pick_pending
)

test_release_cut_and_backport_commit_the_same_opt_out() (
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

test_cut_release_workflow_uses_the_shared_writer() (
  grep -Fq 'source .github/actions/create-backport/kondo-ratchets.sh' "$cut_release_workflow" ||
    fail "the cut-release workflow does not source kondo-ratchets.sh"
  grep -Fq 'write_disabled_ratchets' "$cut_release_workflow" ||
    fail "the cut-release workflow does not call write_disabled_ratchets"
  ! grep -Fq ':disabled' "$cut_release_workflow" ||
    fail "the cut-release workflow carries its own copy of the opt-out"
)

test_invalid_commit_failure_is_propagated() (
  local repo="$test_root/invalid"
  init_repo "$repo"
  cd "$repo"

  if cherry_pick_backport deadbeef; then
    fail "an invalid commit succeeded"
  fi
)

test_generated_script_resolves_ratchets_end_to_end() (
  local repo="$test_root/generated-script"
  init_repo "$repo"
  local commit
  commit=$(feature_commit "$repo" change_app_and_ratchets)
  git -C "$repo" checkout -q release
  commit_release_change "$repo" change_release_app_and_ratchets "Change release app and ratchets"

  cd "$repo"
  cherry_pick_backport "$commit"
  git cherry-pick --abort

  local release_commit
  release_commit=$(git rev-parse HEAD)
  write_backport_script "$commit"
  chmod +x backport.sh
  git add backport.sh
  git commit -qm "Add manual backport script"

  bash -n backport.sh
  grep -Fq 'write_disabled_ratchets ()' backport.sh || fail "the generated script omitted write_disabled_ratchets"
  ./backport.sh

  assert_ratchets_disabled
  assert_only_conflicts app.txt
  assert_cherry_pick_pending
  assert_eq "$release_commit" "$(git rev-parse HEAD)" "the generated script did not return HEAD to the release commit"
  [ ! -e backport.sh ] || fail "the generated script did not remove itself"
  ! git ls-files --error-unmatch backport.sh >/dev/null 2>&1 || fail "the generated script is still tracked"
  ! git status --porcelain | grep -q backport.sh || fail "the generated script left a status entry"
)

# Test harness

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

assert_ratchets() {
  assert_eq "$1" "$(cat .clj-kondo/ratchets.edn)" "unexpected ratchet state"
}

assert_ratchets_disabled() {
  assert_ratchets "$disabled_ratchets"
}

assert_cherry_pick_completed() {
  ! git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null || fail "the cherry-pick is still pending"
}

assert_cherry_pick_pending() {
  git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null || fail "the cherry-pick state was lost"
}

assert_only_conflicts() {
  local expected
  local actual
  expected=$(printf '%s\n' "$@" | sort)
  actual=$(git diff --name-only --diff-filter=U | sort)
  assert_eq "$expected" "$actual" "unexpected unresolved files"
}

assert_empty_commit() {
  git diff --quiet HEAD^ HEAD || fail "the backport commit was not empty"
}

assert_worktree_clean() {
  [ -z "$(git status --porcelain)" ] || fail "the backport left worktree changes"
}

init_repo() {
  local repo=$1
  git init -q -b release "$repo"
  git -C "$repo" config user.email test@example.com
  git -C "$repo" config user.name "Backport test"
  printf 'base\n' > "$repo/app.txt"
  mkdir -p "$repo/.clj-kondo"
  printf '%s\n' "$active_ratchets" > "$repo/.clj-kondo/ratchets.edn"
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

# Sets up a release branch whose ratchets conflict with the feature commit, and prints that commit.
conflicting_ratchet_commit() {
  local repo=$1
  local commit
  commit=$(feature_commit "$repo" change_ratchets)
  git -C "$repo" checkout -q release
  commit_release_change "$repo" change_release_ratchets "Change release ratchets"
  echo "$commit"
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

change_release_app() {
  printf 'release\n' > "$1/app.txt"
}

change_release_ratchets() {
  printf '{:ignore-counts {:release 1}}\n' > "$1/.clj-kondo/ratchets.edn"
}

change_release_app_and_ratchets() {
  change_release_app "$1"
  change_release_ratchets "$1"
}

# Setup writes the opt-out through the shared writer; the only copy is the expected text at the top.
disable_release_ratchets() {
  (cd "$1" && write_disabled_ratchets)
}

commit_release_change() {
  local repo=$1
  local change=$2
  local message=$3
  "$change" "$repo"
  git -C "$repo" add .
  git -C "$repo" commit -qm "$message"
}

run_test() {
  local description=$1
  local test=${description// /_}
  test=${test//-/_}
  test="test_$test"

  declare -F "$test" >/dev/null || fail "missing test function: $test"

  printf 'TEST: %s\n' "$description"
  "$test"
  printf 'PASS: %s\n' "$description"
}

run_test "unrelated backport preserves target ratchets"
run_test "clean ratchet backport installs release opt-out"
run_test "disabled release absorbs ratchet-only backport"
run_test "ratchet-only conflict is resolved"
run_test "continuation never opens an editor"
run_test "non-ratchet conflict remains manual"
run_test "mixed conflict resolves only ratchets"
run_test "release cut and backport commit the same opt-out"
run_test "cut-release workflow uses the shared writer"
run_test "invalid commit failure is propagated"
run_test "generated script resolves ratchets end-to-end"

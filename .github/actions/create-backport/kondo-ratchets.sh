#!/usr/bin/env bash

set -euo pipefail

# The only place that knows what a release branch's opt-out looks like. The cut-release workflow, the
# backport helper, and the tests all go through this function.
write_disabled_ratchets() {
  mkdir -p .clj-kondo
  printf '%s\n' \
    ';; Kondo ignore ratchets apply only to master; this release branch opts out.' \
    ';; The test and fixer recognize this explicit opt-out.' \
    '{:disabled true}' \
    > .clj-kondo/ratchets.edn
}

disable_ratchets() {
  local commit=$1
  local file=.clj-kondo/ratchets.edn
  [ -n "$(git diff-tree --root --no-commit-id --name-only -r "$commit" -- "$file")" ] || return 0

  echo "$file: disabling kondo ratchets on the release branch"
  write_disabled_ratchets
  git add -- "$file"

  if ! git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null; then
    if ! git diff --cached --quiet HEAD; then
      git commit --amend --no-edit
    fi
    return 0
  fi

  if [ -z "$(git ls-files -u)" ]; then
    echo "$file was the only conflict, finishing the cherry-pick"
    if git diff --cached --quiet HEAD; then
      echo "nothing left to apply, committing the backport empty"
      git commit --allow-empty --no-edit
    else
      # GIT_EDITOR outranks core.editor, VISUAL, and EDITOR, so the continuation can never wait on
      # an editor; the repository's own editor configuration is left alone.
      GIT_EDITOR=true git cherry-pick --continue
    fi
  fi
}

cherry_pick_backport() {
  local commit=$1
  local status=0
  git cherry-pick "$commit" || status=$?
  if [ "$status" -ne 0 ] && ! git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null; then
    echo "cherry-pick failed without entering a resolvable conflict state" >&2
    return "$status"
  fi

  disable_ratchets "$commit"
  if [ "$status" -ne 0 ] &&
     git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null &&
     [ -z "$(git ls-files -u)" ]; then
    echo "cherry-pick stopped without a file conflict to resolve" >&2
    return "$status"
  fi
}

write_backport_script() {
  local commit=$1
  {
    echo "#!/usr/bin/env bash"
    echo "set -euo pipefail"
    echo "git reset HEAD~1"
    echo "rm ./backport.sh"
    declare -f write_disabled_ratchets disable_ratchets cherry_pick_backport
    printf 'cherry_pick_backport %q\n' "$commit"
    printf '%s\n' "printf 'Resolve conflicts and force push this branch.\\n\\nTo backport translations run: bin/i18n/merge-translations <release-branch>\\n'"
  } > ./backport.sh
}

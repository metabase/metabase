#!/usr/bin/env bash
set -euo pipefail
git reset HEAD~1
rm ./backport.sh
write_disabled_ratchets () 
{ 
    local file=$1;
    mkdir -p "$(dirname "$file")";
    printf '%s\n' ';; Kondo ignore ratchets apply only to master; this release branch opts out.' ';; The test and fixer recognize this explicit opt-out.' '{:disabled true}' > "$file"
}
disable_ratchets () 
{ 
    local commit=$1;
    local file;
    local disabled_any=;
    for file in .clj-kondo/ratchets.edn .clj-kondo/ratchets-test.edn;
    do
        [ -n "$(git diff-tree --root --no-commit-id --name-only -r "$commit" -- "$file")" ] || continue;
        echo "$file: disabling kondo ratchets on the release branch";
        write_disabled_ratchets "$file";
        git add -- "$file";
        disabled_any=1;
    done;
    [ -n "$disabled_any" ] || return 0;
    if ! git rev-parse -q --verify CHERRY_PICK_HEAD > /dev/null; then
        if ! git diff --cached --quiet HEAD; then
            git commit --amend --no-edit;
        fi;
        return 0;
    fi;
    if [ -z "$(git ls-files -u)" ]; then
        echo "disabled ratchet file(s) were the only conflict, finishing the cherry-pick";
        if git diff --cached --quiet HEAD; then
            echo "nothing left to apply, committing the backport empty";
            git commit --allow-empty --no-edit;
        else
            GIT_EDITOR=true git cherry-pick --continue;
        fi;
    fi
}
cherry_pick_backport () 
{ 
    local commit=$1;
    local status=0;
    git cherry-pick "$commit" || status=$?;
    if [ "$status" -ne 0 ] && ! git rev-parse -q --verify CHERRY_PICK_HEAD > /dev/null; then
        echo "cherry-pick failed without entering a resolvable conflict state" 1>&2;
        return "$status";
    fi;
    disable_ratchets "$commit";
    if [ "$status" -ne 0 ] && git rev-parse -q --verify CHERRY_PICK_HEAD > /dev/null && [ -z "$(git ls-files -u)" ]; then
        echo "cherry-pick stopped without a file conflict to resolve" 1>&2;
        return "$status";
    fi
}
cherry_pick_backport 2389bc777b0edd25606732a21ed48baa8fb6a393
printf 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>\n'

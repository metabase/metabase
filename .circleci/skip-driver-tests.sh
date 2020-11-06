#!/usr/bin/env bash

# Determines whether we should skip tests for a driver, usage:
#
#    ./.circleci/skip-driver-tests.sh oracle

set -euo pipefail

driver="$1"

commit_message=`cat commit.txt`

parent_branch=`git log --decorate --simplify-by-decoration --oneline | grep -v "HEAD" | head -n 1 | sed -r 's/^\w+\s\(origin\/([^,)]+).+$/\1/'`
files_with_changes=`git diff --name-only "$parent_branch" | grep '.clj'`

if [[ "$CIRCLE_BRANCH" =~ ^master|release-.+$ ]]; then
    is_master_or_release_branch=true;
else
    is_master_or_release_branch=false;
fi

# ALWAYS run driver tests for master or release branches.
if is_master_or_release_branch; then
    echo "Running drivers tests: this is master or a release-* branch"
    exit 1;
else
    echo "Branch is NOT master or a release-* branch"
fi

if [[ "$COMMIT_MESSAGE" == *"[ci all]"* ]]; then
    has_ci_drivers_commit_message=true;
elif [[ "$COMMIT_MESSAGE" == *"[ci drivers]"* ]]; then
    has_ci_drivers_commit_message=true;
elif [[ "$COMMIT_MESSAGE" == *"[ci $driver]"* ]]; then
    has_ci_drivers_commit_message=true;
else
    has_ci_drivers_commit_message=false;
fi

# ALWAYS run driver tests if the commit includes [ci all], [ci drivers], or [ci <driver>]
if has_ci_drivers_commit_message; then
    echo "Running driver tests: commit message includes [ci all], [ci drivers], or [ci $driver]"
    exit 2;
else
    echo "Commit message does NOT include [ci all], [ci drivers], or [ci $driver]"
fi

if [[ "$COMMIT_MESSAGE" == *"[ci quick]"* ]]; then
    has_ci_quick_message=true;
else
    has_ci_quick_message=false;
fi

if [ -n "$files_with_changes" ]; then
    has_backend_changes=true;
else
    has_backend_changes=false;
fi

# If any backend files have changed, run driver tests *unless* the commit includes [ci quick]
if has_backend_changes; then
    echo "Branch has backend changes"
    if has_ci_quick_message; then
        echo "Not running driver tests: commit message includes [ci quick]"
        exit 0;
    else
        echo "Running driver tests: commit message does not include [ci quick] "
        exit 3;
    fi
else
    echo "Not running driver tests: branch has no backend changes"
    exit 0
fi

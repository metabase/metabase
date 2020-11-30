#!/usr/bin/env bash

# Determines whether we should skip tests for a driver, usage:
#
#    ./.circleci/skip-driver-tests.sh oracle

set -euo pipefail

driver="$1"

commit_message=`cat commit.txt`

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

if [ -f "$driver.success" ]; then
    tests_already_passed=true;
else
    tests_already_passed=false;
fi

# If tests have already passed for this set of backend changes, we can skip tests.
# If tests have not yet passed, run driver tests *unless* the commit includes [ci quick]
if tests_already_passed; then
    echo "Not running driver tests: tests have already passed for current backend source"
    exit 0
else
    echo "Tests have not yet passed for current backend source"
    if has_ci_quick_message; then
        echo "Not running driver tests: commit message includes [ci quick]"
        exit 0;
    else
        echo "Running driver tests: commit message does not include [ci quick] "
        exit 3;
    fi
fi

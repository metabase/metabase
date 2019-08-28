#!/usr/bin/env bash

# Determines whether we should skip tests for a driver, usage:
#
#    ./.circleci/skip-driver-tests.sh oracle
#
# Returns false if the commit message contains [ci all], [ci drivers], or [ci <driver-name>],
# or if the current branch is master or a release branch.

set -eu

COMMIT_MESSAGE=`git log -1 --oneline`

! [[ "$CIRCLE_BRANCH" =~ ^master|release-.+$ ]] &&
    ! [[ "$COMMIT_MESSAGE" == *"[ci all]"* ]] &&
    ! [[ "$COMMIT_MESSAGE" == *"[ci drivers]"* ]] &&
    ! [[ "$COMMIT_MESSAGE" == *"[ci $1]"* ]] &&
    echo "Skipping driver tests: $1"

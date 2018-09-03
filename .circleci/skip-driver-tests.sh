#!/usr/bin/env bash

set -eu

COMMIT_MESSAGE=`git log -1 --oneline`

! [[ "$CIRCLE_BRANCH" =~ ^master|release-.+$ ]] &&
    ! [[ "$COMMIT_MESSAGE" == *"[ci all]"* ]] &&
    ! [[ "$COMMIT_MESSAGE" == *"[ci drivers]"* ]] &&
    ! [[ "$COMMIT_MESSAGE" == *"[ci $1]"* ]] &&
    echo "Skipping driver tests: $1"

#!/usr/bin/env bash

# Generate bot.patch with the full diff of the current branch against origin/master.
# bot.patch is used by autobot to seed new worktrees with bot tooling — every time
# you make a change to the bot infrastructure on this branch, re-run this script
# so the next autobot launch picks up the fix.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

git fetch --quiet origin master
git diff origin/master...HEAD > bot.patch

echo "Wrote bot.patch ($(wc -l < bot.patch | tr -d ' ') lines)"
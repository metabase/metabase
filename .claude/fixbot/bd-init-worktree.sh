#!/usr/bin/env bash
# Initialize beads in a git worktree by creating the database in a temp repo
# and moving it into the current directory.
#
# Usage: bd-init-worktree.sh [worktree-name]

set -euo pipefail

if [ -d ".beads" ]; then
  echo "beads already initialized, skipping"
  exit 0
fi

name="${1:-$(basename "$PWD")}"
scratch=".fixbot/bd-scratch"

mkdir -p "$scratch"
git init -q "$scratch/repo"
(cd "$scratch/repo" && bd init --stealth --quiet -p "$name")
mv "$scratch/repo/.beads" .beads
rm -rf "$scratch"

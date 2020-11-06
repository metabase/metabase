#! /usr/bin/env bash

set -euo pipefail

echo "HERE!"

git log
parent_commit=`git log --decorate --simplify-by-decoration --oneline | grep -v "HEAD" | head -n 1`;
echo "parent commit: $parent_commit";

parent_branch=`echo "$parent_commit" | sed -r 's/^\w+\s\(origin\/([^,)]+).+$/\1/'`;
echo "parent branch: $parent_branch";

git diff --name-only "$parent_branch"..HEAD > files_with_changes.txt
echo "Wrote files_with_changes.txt"

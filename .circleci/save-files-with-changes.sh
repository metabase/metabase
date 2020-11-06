#! /usr/bin/env bash

set -euo pipefail

parent_commit_info=`git log --oneline --first-parent --decorate=short --simplify-by-decoration --branches -n 10 | grep 'origin/' | head -n 1`
echo "parent commit info: $parent_commit_info";

parent_branch=`echo "$parent_commit_info" | sed -r 's/^\w+\s\(origin\/([^,)]+).+$/\1/'`;
echo "parent branch: $parent_branch";

git diff --name-only "$parent_branch"..HEAD > files_with_changes.txt
echo "Wrote files_with_changes.txt"

#!/bin/bash

echo "=== Debugging the git clean check ==="

echo "Full git status:"
git status --porcelain

echo ""
echo "After filtering (current filter):"
git status --porcelain | grep -v "^??.*\.sh$" | grep -v "^??.*\.md$" | grep -v "^??.*INSTRUCTIONS"

echo ""
echo "Testing if filter result is empty:"
RESULT=$(git status --porcelain | grep -v "^??.*\.sh$" | grep -v "^??.*\.md$" | grep -v "^??.*INSTRUCTIONS")
if [[ -n $RESULT ]]; then
    echo "Filter result is NOT empty:"
    echo "$RESULT"
else
    echo "Filter result IS empty - this should allow the script to continue"
fi

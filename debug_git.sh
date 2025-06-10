#!/bin/bash

# Debug version - let's see what's actually happening

set -e  # Exit on any error
set -x  # Print every command as it runs

echo "=== DEBUG: Checking current state ==="
echo "Current branch: $(git branch --show-current)"
echo "Current directory: $(pwd)"
echo "Git status:"
git status --short

echo ""
echo "=== DEBUG: Testing git operations ==="

# Test if we can create a simple branch
TEST_BRANCH="test-branch-debug"
echo "Testing branch creation..."

# Clean up test branch if it exists
if git show-ref --verify --quiet refs/heads/"$TEST_BRANCH"; then
    echo "Deleting existing test branch..."
    git branch -D "$TEST_BRANCH"
fi

# Try to create test branch
echo "Creating test branch from emb-357-wrap-editabledashboard-with-dashboardcontext..."
git checkout -b "$TEST_BRANCH" "emb-357-wrap-editabledashboard-with-dashboardcontext"

echo "Test branch created successfully!"
echo "Current branch: $(git branch --show-current)"

# Try to copy a file
echo "Testing file copy..."
git checkout "combine-editable-and-interactive-dashboards" -- "enterprise/frontend/src/embedding-sdk/components/public/SdkDashboard/SdkDashboard.tsx"

echo "File copied! Checking status:"
git status --short

# Clean up
echo "Cleaning up test..."
git checkout "combine-editable-and-interactive-dashboards"
git branch -D "$TEST_BRANCH"

echo "=== DEBUG: Test completed successfully! ==="
echo "The git operations work. The script should work too."
echo "Try running the main script again and look for error messages."

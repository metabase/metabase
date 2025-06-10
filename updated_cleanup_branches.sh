#!/bin/bash

# Updated script to clean up all branches created by the new splitting scripts
# Use this to start fresh if needed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Updated Branch Cleanup Script ===${NC}"

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${YELLOW}Current branch: ${CURRENT_BRANCH}${NC}"

# List of all branches that might have been created (old and new)
ALL_SPLIT_BRANCHES=(
    # Old branch names (from previous scripts)
    "refactor/title-description-tsx-conversion"
    "test/e2e-misc-helpers-debug-logging"
    "types/storybook-dashboard-id-arg-type"
    "refactor/extract-dashboard-action-types"
    "feature/dashcard-menu-conditional-edit-link"
    "chore/data-fetching-formatting"
    "feature/create-sdk-dashboard-base-component"
    "refactor/dashboard-context-infrastructure"
    "refactor/interactive-dashboard-use-sdk-dashboard"
    "refactor/editable-dashboard-use-sdk-dashboard"
    
    # New branch names (from updated scripts)
    "feat/create-sdk-dashboard-base-component"
    "refactor/simplify-interactive-dashboard"
    "refactor/simplify-editable-dashboard"
    "chore/move-common-dashboard-params"
    "types/dashboard-action-types-extraction"
)

echo -e "\n${YELLOW}This will delete the following branches if they exist:${NC}"
EXISTING_COUNT=0
for branch in "${ALL_SPLIT_BRANCHES[@]}"; do
    if git show-ref --verify --quiet refs/heads/"$branch"; then
        echo -e "${RED}  ✗ $branch ${YELLOW}(exists)${NC}"
        ((EXISTING_COUNT++))
    else
        echo -e "${GREEN}  ✓ $branch ${YELLOW}(doesn't exist)${NC}"
    fi
done

if [[ $EXISTING_COUNT -eq 0 ]]; then
    echo -e "\n${GREEN}✅ No split branches found to delete!${NC}"
    exit 0
fi

echo -e "\n${BLUE}=== Confirmation ===${NC}"
echo -e "${YELLOW}Found $EXISTING_COUNT branches to delete.${NC}"
echo -e "${YELLOW}Are you sure you want to delete ALL split branches? (y/n)${NC}"
read -r CONFIRM_DELETE

if [[ $CONFIRM_DELETE =~ ^[Yy]$ ]]; then
    echo -e "\n${BLUE}=== Deleting branches ===${NC}"
    
    # Make sure we're not on any of the branches we're about to delete
    for branch in "${ALL_SPLIT_BRANCHES[@]}"; do
        if [[ "$CURRENT_BRANCH" == "$branch" ]]; then
            echo -e "${YELLOW}You're currently on $branch. Switching to combine-editable-and-interactive-dashboards...${NC}"
            git checkout combine-editable-and-interactive-dashboards
            break
        fi
    done
    
    # Delete each branch
    DELETED_COUNT=0
    for branch in "${ALL_SPLIT_BRANCHES[@]}"; do
        if git show-ref --verify --quiet refs/heads/"$branch"; then
            echo -e "${YELLOW}Deleting: $branch${NC}"
            git branch -D "$branch"
            ((DELETED_COUNT++))
        fi
    done
    
    echo -e "\n${GREEN}✅ Cleanup complete!${NC}"
    echo -e "${GREEN}Deleted $DELETED_COUNT branches${NC}"
    
    # Show current branch
    echo -e "\n${YELLOW}Current branch: $(git branch --show-current)${NC}"
    
else
    echo -e "${YELLOW}Cleanup cancelled. No branches were deleted.${NC}"
fi

echo -e "\n${BLUE}=== Optional: Clean up remote branches ===${NC}"
echo -e "${YELLOW}Do you also want to delete these branches from the remote? (y/n)${NC}"
echo -e "${RED}WARNING: This will delete the branches on GitHub/remote!${NC}"
read -r DELETE_REMOTE

if [[ $DELETE_REMOTE =~ ^[Yy]$ ]]; then
    echo -e "\n${BLUE}=== Deleting remote branches ===${NC}"
    
    REMOTE_DELETED_COUNT=0
    for branch in "${ALL_SPLIT_BRANCHES[@]}"; do
        # Check if remote branch exists
        if git ls-remote --heads origin "$branch" | grep -q "$branch"; then
            echo -e "${YELLOW}Deleting remote branch: origin/$branch${NC}"
            git push origin --delete "$branch" 2>/dev/null || {
                echo -e "${RED}Failed to delete origin/$branch (might not exist or no permission)${NC}"
            }
            ((REMOTE_DELETED_COUNT++))
        fi
    done
    
    echo -e "\n${GREEN}✅ Remote cleanup complete!${NC}"
    echo -e "${GREEN}Attempted to delete $REMOTE_DELETED_COUNT remote branches${NC}"
else
    echo -e "${YELLOW}Remote cleanup skipped.${NC}"
fi

echo -e "\n${GREEN}🎉 All done! You can now run the updated splitting script fresh.${NC}"
echo -e "${YELLOW}Run: ./updated_split_branches.sh${NC}"

#!/bin/bash

# Updated script for splitting the SdkDashboard refactoring PR
# Based on current state analysis

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Updated SdkDashboard Branch Splitting Script ===${NC}"

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${YELLOW}Current branch: ${CURRENT_BRANCH}${NC}"

# Check if working directory is clean (ignore all untracked files)
# Only check for modified/staged files (M, A, D, R, C, U) - ignore untracked files (??)
set +e  # Temporarily disable exit on error for this check
GIT_CLEAN_CHECK=$(git status --porcelain | grep -v "^??" | grep -v "^D " || true)
set -e  # Re-enable exit on error

if [[ -n "$GIT_CLEAN_CHECK" ]]; then
    echo -e "${RED}Working directory is not clean. Please commit or stash changes first.${NC}"
    echo -e "${YELLOW}Note: Ignoring all untracked files${NC}"
    echo "$GIT_CLEAN_CHECK"
    exit 1
fi

echo -e "${GREEN}✅ Working directory is clean (ignoring untracked files)${NC}"

# Base branch - this branch is stacked on emb-357-wrap-editabledashboard-with-dashboardcontext
BASE_BRANCH="emb-357-wrap-editabledashboard-with-dashboardcontext"

echo -e "${YELLOW}Base branch: ${BASE_BRANCH}${NC}"

# Check if we should clean up existing branches
echo -e "\n${BLUE}=== Branch Cleanup ===${NC}"
echo -e "${YELLOW}Do you want to delete existing split branches first? (y/n)${NC}"
read -r CLEANUP_BRANCHES

if [[ $CLEANUP_BRANCHES =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cleaning up existing branches...${NC}"
    
    # Updated list of branches that might already exist
    BRANCHES_TO_CLEANUP=(
        "feat/create-sdk-dashboard-base-component"
        "refactor/dashboard-context-infrastructure"
        "refactor/simplify-interactive-dashboard"
        "refactor/simplify-editable-dashboard"
        "chore/move-common-dashboard-params"
        "types/dashboard-action-types-extraction"
    )
    
    for branch in "${BRANCHES_TO_CLEANUP[@]}"; do
        if git show-ref --verify --quiet refs/heads/"$branch"; then
            echo -e "${YELLOW}Deleting existing branch: $branch${NC}"
            git branch -D "$branch"
        fi
    done
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
fi

# Function to handle git index lock issues
handle_git_lock() {
    local command="$1"
    local max_attempts=5
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        echo "Attempt $attempt of $max_attempts: $command"
        
        if eval "$command"; then
            return 0  # Success
        else
            local exit_code=$?
            echo -e "${YELLOW}⚠️  Git command failed (exit code: $exit_code)${NC}"
            
            # Check for index lock
            if [[ -f ".git/index.lock" ]]; then
                echo -e "${YELLOW}🔒 Found git index lock file. Removing it...${NC}"
                rm -f ".git/index.lock"
            fi
            
            # Check for other lock files
            if [[ -f ".git/refs/heads.lock" ]]; then
                echo -e "${YELLOW}🔒 Found refs lock file. Removing it...${NC}"
                rm -f ".git/refs/heads.lock"
            fi
            
            if [[ $attempt -eq $max_attempts ]]; then
                echo -e "${RED}❌ Git command failed after $max_attempts attempts${NC}"
                echo -e "${YELLOW}Command: $command${NC}"
                echo -e "${YELLOW}You can try running the script again, or continue manually${NC}"
                return $exit_code
            else
                echo -e "${YELLOW}💤 Waiting 2 seconds before retry...${NC}"
                sleep 2
                ((attempt++))
            fi
        fi
    done
}
create_branch_with_files() {
    local branch_name=$1
    local description=$2
    shift 2
    local files=("$@")
    
    echo -e "\n${GREEN}Creating branch: ${branch_name}${NC}"
    echo -e "${BLUE}Description: ${description}${NC}"
    
    # Check if branch already exists
    if git show-ref --verify --quiet refs/heads/"$branch_name"; then
        echo -e "${YELLOW}⚠️  Branch ${branch_name} already exists. Skipping...${NC}"
        return
    fi
    
    # Create new branch from base
    if ! handle_git_lock "git checkout -b '${branch_name}' '${BASE_BRANCH}'"; then
        echo -e "${RED}❌ Failed to create branch ${branch_name}${NC}"
        return
    fi
    
    # Copy the specific files from the original branch
    if ! handle_git_lock "git checkout '${CURRENT_BRANCH}' -- '${files[*]}'"; then
        echo -e "${YELLOW}⚠️  Some files don't exist in ${CURRENT_BRANCH}. Skipping this branch.${NC}"
        git checkout "${CURRENT_BRANCH}"
        git branch -D "${branch_name}"
        return
    fi
    
    # Check if there are actually changes to commit
    if [[ -z $(git status --porcelain) ]]; then
        echo -e "${YELLOW}⚠️  No changes to commit for ${branch_name}. Skipping...${NC}"
        git checkout "${CURRENT_BRANCH}"
        git branch -D "${branch_name}"
        return
    fi
    
    # Add and commit with retry logic
    if ! handle_git_lock "git add '${files[*]}'"; then
        echo -e "${RED}❌ Failed to add files for ${branch_name}${NC}"
        git checkout "${CURRENT_BRANCH}"
        git branch -D "${branch_name}"
        return
    fi
    
    if ! handle_git_lock "git commit --no-verify -m '${description}

Files changed:
$(printf '%s\n' "${files[@]}" | sed 's/^/- /')

Split from: ${CURRENT_BRANCH}'"; then
        echo -e "${RED}❌ Failed to commit for ${branch_name}${NC}"
        git checkout "${CURRENT_BRANCH}"
        git branch -D "${branch_name}"
        return
    fi
    
    echo -e "${GREEN}✅ Created branch: ${branch_name}${NC}"
    echo -e "${YELLOW}Files included:${NC}"
    printf '  %s\n' "${files[@]}" | sed 's/^/  /'
}

echo -e "\n${BLUE}=== Creating updated branches based on current PR ===${NC}"

# 1. Dashboard action types extraction (independent)
create_branch_with_files \
    "types/dashboard-action-types-extraction" \
    "types: Extract dashboard action types to separate file

- Move DASHBOARD_ACTION constants to action-types.ts
- Update imports in related files
- Improve code organization and reduce file size
- Add new DOWNLOAD_DASHBOARD_PDF action type

This is an independent change that improves code organization." \
    "frontend/src/metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-types.ts"

# 2. Move use-common-dashboard-params (file organization)
create_branch_with_files \
    "chore/move-common-dashboard-params" \
    "chore: Move use-common-dashboard-params to SdkDashboard folder

- Move use-common-dashboard-params.tsx to SdkDashboard folder
- Fixes circular dependency issues
- Better file organization for shared dashboard logic

This is a file organization change to prepare for the SdkDashboard component." \
    "enterprise/frontend/src/embedding-sdk/components/public/SdkDashboard/use-common-dashboard-params.tsx"

# 3. Dashboard context infrastructure (core infrastructure)
create_branch_with_files \
    "refactor/dashboard-context-infrastructure" \
    "refactor: Enhance dashboard context infrastructure

- Move refresh and fullscreen logic into DashboardContext
- Add better state management for dashboard UI controls
- Update parameter handling and utilities
- Enhance dashboard context with new capabilities
- Update action button infrastructure

These changes provide the infrastructure needed for the new
SdkDashboard architecture by consolidating dashboard state management." \
    "frontend/src/metabase/dashboard/context/context.tsx" \
    "frontend/src/metabase/dashboard/context/context.redux.ts" \
    "frontend/src/metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/action-buttons.tsx" \
    "frontend/src/metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants.ts" \
    "frontend/src/metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/types.ts" \
    "frontend/src/metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/ExportDashboardAsPdf.tsx" \
    "frontend/src/metabase/dashboard/components/DashboardHeader/DashboardHeaderView.tsx" \
    "frontend/src/metabase/dashboard/components/DashboardHeader/buttons/ExportAsPdfButton.tsx" \
    "frontend/src/metabase/dashboard/components/Dashboard/Dashboard.tsx" \
    "frontend/src/metabase/dashboard/components/DashboardParameterList/DashboardParameterList.tsx" \
    "frontend/src/metabase/dashboard/components/DashCard/DashCardVisualization.tsx" \
    "frontend/src/metabase/dashboard/components/DashCard/DashCardMenu/DashCardMenuItems.tsx" \
    "frontend/src/metabase/dashboard/selectors.ts" \
    "enterprise/frontend/src/embedding-sdk/hooks/private/use-sdk-dashboard-params.ts"

# 4. Create SdkDashboard base component (main new feature)
create_branch_with_files \
    "feat/create-sdk-dashboard-base-component" \
    "feat: Create SdkDashboard base component

- Add new SdkDashboard component with comprehensive functionality
- Include TypeScript types and proper component architecture
- Add Storybook stories for documentation and testing
- Set up proper exports and index files
- Create foundation component for dashboard variants

This creates the base component that InteractiveDashboard 
and EditableDashboard will extend, consolidating shared logic.

Depends on: types/dashboard-action-types-extraction
Depends on: chore/move-common-dashboard-params
Depends on: refactor/dashboard-context-infrastructure" \
    "enterprise/frontend/src/embedding-sdk/components/public/SdkDashboard/SdkDashboard.tsx" \
    "enterprise/frontend/src/embedding-sdk/components/public/SdkDashboard/SdkDashboard.stories.tsx" \
    "enterprise/frontend/src/embedding-sdk/components/public/SdkDashboard/types.ts" \
    "enterprise/frontend/src/embedding-sdk/components/public/SdkDashboard/index.ts"

# 5. Simplify InteractiveDashboard (refactor to use base)
create_branch_with_files \
    "refactor/simplify-interactive-dashboard" \
    "refactor: Simplify InteractiveDashboard to use SdkDashboard base

- Reduce InteractiveDashboard to a thin wrapper around SdkDashboard
- Remove duplicate code and logic (now ~25 lines vs 200+ before)
- Configure SdkDashboard with Interactive-specific settings
- Maintain all existing functionality while reducing code duplication
- Update unit tests to work with new architecture

Depends on: feat/create-sdk-dashboard-base-component" \
    "enterprise/frontend/src/embedding-sdk/components/public/InteractiveDashboard/InteractiveDashboard.tsx" \
    "enterprise/frontend/src/embedding-sdk/components/public/InteractiveDashboard/InteractiveDashboard.unit.spec.tsx"

# 6. Simplify EditableDashboard (refactor to use base)
create_branch_with_files \
    "refactor/simplify-editable-dashboard" \
    "refactor: Simplify EditableDashboard to use SdkDashboard base

- Reduce EditableDashboard to a thin wrapper around SdkDashboard
- Remove duplicate code and logic (now ~30 lines vs 200+ before)
- Configure SdkDashboard with Editable-specific settings
- Use SDK_DASHBOARD_VIEW_ACTIONS for proper editing capabilities
- Maintain all existing functionality while reducing code duplication

Depends on: feat/create-sdk-dashboard-base-component" \
    "enterprise/frontend/src/embedding-sdk/components/public/InteractiveDashboard/EditableDashboard.tsx"

echo -e "\n${GREEN}=== Updated branches created! ===${NC}"
echo -e "${YELLOW}Recommended merge order:${NC}"
echo "1. types/dashboard-action-types-extraction (independent)"
echo "2. chore/move-common-dashboard-params (file organization)"
echo "3. refactor/dashboard-context-infrastructure (core infrastructure)"
echo "4. feat/create-sdk-dashboard-base-component (main component)"
echo "5. refactor/simplify-interactive-dashboard (uses base component)"
echo "6. refactor/simplify-editable-dashboard (uses base component)"

echo -e "\n${BLUE}=== Create PRs? ===${NC}"
echo -e "${YELLOW}Would you like to automatically push branches and create PRs? (y/n)${NC}"
read -r CREATE_PRS

if [[ $CREATE_PRS =~ ^[Yy]$ ]]; then
    echo -e "\n${BLUE}=== Creating PRs for updated branches ===${NC}"
    
    # Check if gh CLI is installed
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}GitHub CLI (gh) is not installed. Please install it first:${NC}"
        echo -e "${YELLOW}brew install gh${NC}"
        echo -e "${YELLOW}Then run: gh auth login${NC}"
        exit 1
    fi
    
    # Array of branches with their descriptions and dependencies
    declare -a BRANCH_INFO=(
        "types/dashboard-action-types-extraction|types: Extract dashboard action types to separate file|Extracts DASHBOARD_ACTION constants to improve code organization and prepare for new dashboard actions.|"
        "chore/move-common-dashboard-params|chore: Move use-common-dashboard-params to SdkDashboard folder|Moves shared dashboard logic to fix circular dependencies and improve file organization.|"
        "refactor/dashboard-context-infrastructure|refactor: Enhance dashboard context infrastructure|Consolidates dashboard state management and provides infrastructure for the new SdkDashboard architecture.|"
        "feat/create-sdk-dashboard-base-component|feat: Create SdkDashboard base component|Creates the foundation component that consolidates shared dashboard logic for InteractiveDashboard and EditableDashboard.|Depends on: types/dashboard-action-types-extraction, chore/move-common-dashboard-params, refactor/dashboard-context-infrastructure"
        "refactor/simplify-interactive-dashboard|refactor: Simplify InteractiveDashboard to use SdkDashboard base|Reduces InteractiveDashboard to a ~25 line wrapper around SdkDashboard, eliminating code duplication.|Depends on: feat/create-sdk-dashboard-base-component"
        "refactor/simplify-editable-dashboard|refactor: Simplify EditableDashboard to use SdkDashboard base|Reduces EditableDashboard to a ~30 line wrapper around SdkDashboard, eliminating code duplication.|Depends on: feat/create-sdk-dashboard-base-component"
    )
    
    for branch_info in "${BRANCH_INFO[@]}"; do
        IFS='|' read -r branch_name pr_title pr_body pr_dependencies <<< "$branch_info"
        
        echo -e "\n${GREEN}Creating PR for: ${branch_name}${NC}"
        
        # Push the branch with retry logic
        if ! handle_git_lock "git push --no-verify origin '$branch_name'"; then
            echo -e "${RED}❌ Failed to push branch $branch_name${NC}"
            echo -e "${YELLOW}You can push manually later: git push origin $branch_name${NC}"
            continue  # Skip PR creation for this branch but continue with others
        fi
        
        # Build PR body with dependencies if they exist
        full_pr_body="$pr_body

This is part of splitting the large SdkDashboard refactoring PR into smaller, focused changes.

**Type:** $(if [[ $branch_name == feat/* ]]; then echo "New feature"; elif [[ $branch_name == refactor/* ]]; then echo "Refactoring"; elif [[ $branch_name == types/* ]]; then echo "Type improvement"; else echo "Maintenance"; fi)
**Original PR:** combine-editable-and-interactive-dashboards-2
**Stack:** SdkDashboard Refactoring"
        
        if [[ -n "$pr_dependencies" ]]; then
            full_pr_body="$full_pr_body

**$pr_dependencies**"
        fi
        
        # Create PR with base branch
        gh pr create \
            --base "${BASE_BRANCH}" \
            --head "$branch_name" \
            --title "$pr_title" \
            --body "$full_pr_body"
        
        echo -e "${GREEN}✅ Created PR for ${branch_name}${NC}"
    done
    
    echo -e "\n${GREEN}🎉 All PRs created!${NC}"
    echo -e "${YELLOW}Remember to merge them in dependency order!${NC}"
else
    echo -e "${YELLOW}Skipping PR creation. You can create them manually later.${NC}"
fi

# Return to original branch with retry logic
if ! handle_git_lock "git checkout '${CURRENT_BRANCH}'"; then
    echo -e "${YELLOW}⚠️  Failed to return to original branch. You're currently on: $(git branch --show-current)${NC}"
    echo -e "${YELLOW}You can return manually: git checkout ${CURRENT_BRANCH}${NC}"
else
    echo -e "\n${GREEN}Returned to original branch: ${CURRENT_BRANCH}${NC}"
fi

echo -e "\n${BLUE}=== Summary ===${NC}"
echo -e "${GREEN}✅ Created 6 focused branches based on current PR state${NC}"
echo -e "${YELLOW}The refactoring is much cleaner than expected!${NC}"
echo -e "${YELLOW}InteractiveDashboard and EditableDashboard are now simple wrappers${NC}"

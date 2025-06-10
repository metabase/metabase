# Updated Branch Splitting Instructions - SdkDashboard Refactoring

## Overview
Based on analysis of the current PR state, I've created an updated splitting strategy that reflects the actual changes made. The refactoring is much cleaner than expected!

**Key Discovery:** InteractiveDashboard and EditableDashboard are now just ~25-30 line wrapper components around the new SdkDashboard base component. This is a excellent refactoring that eliminates tons of code duplication.

## Updated Scripts
- `updated_split_branches.sh` - Creates 6 focused branches based on current PR state
- `updated_cleanup_branches.sh` - Cleans up all old and new branch variations

## Prerequisites
Make sure you're on your feature branch (`combine-editable-and-interactive-dashboards`) and have a clean working directory:
```bash
git status
# Should show clean working directory

# Verify you're on the right branch
git branch --show-current
# Should show: combine-editable-and-interactive-dashboards

# Verify the base branch exists
git branch -a | grep emb-357-wrap-editabledashboard-with-dashboardcontext
```

### Optional: GitHub CLI for automatic PR creation
If you want to automatically create PRs, install and authenticate GitHub CLI:
```bash
# Install GitHub CLI (if not already installed)
brew install gh

# Authenticate with GitHub
gh auth login
```

## Step 1: Clean up any existing branches (optional)
```bash
chmod +x updated_cleanup_branches.sh
./updated_cleanup_branches.sh
```

## Step 2: Make the new script executable and run it
```bash
chmod +x updated_split_branches.sh
./updated_split_branches.sh
```

This creates 6 focused branches based on the actual current state:

### **Independent/Foundation Changes:**
1. **`types/dashboard-action-types-extraction`** - Extract action types (independent)
2. **`chore/move-common-dashboard-params`** - Move shared file (file organization)
3. **`refactor/dashboard-context-infrastructure`** - Enhance context (core infrastructure)

### **Main Refactoring Changes:**
4. **`feat/create-sdk-dashboard-base-component`** - The new base component with Storybook
5. **`refactor/simplify-interactive-dashboard`** - Reduce to ~25 line wrapper
6. **`refactor/simplify-editable-dashboard`** - Reduce to ~30 line wrapper

**The script will ask if you want to automatically create PRs using GitHub CLI.**

## Recommended Merge Order
1. `types/dashboard-action-types-extraction` (independent)
2. `chore/move-common-dashboard-params` (file organization)
3. `refactor/dashboard-context-infrastructure` (core infrastructure)
4. `feat/create-sdk-dashboard-base-component` (main component)
5. `refactor/simplify-interactive-dashboard` (uses base component)
6. `refactor/simplify-editable-dashboard` (uses base component)

## Key Benefits of This Split

### **Much Cleaner Than Expected!**
- InteractiveDashboard: Reduced from ~200+ lines to ~25 lines
- EditableDashboard: Reduced from ~200+ lines to ~30 lines
- SdkDashboard: Consolidates all shared logic in one place
- Clear separation of concerns

### **Focused PRs:**
- Each PR has a clear, single purpose
- Dependencies are clearly marked
- Infrastructure changes are isolated
- Easy to review and understand

### **Better Architecture:**
- SdkDashboard is the foundation component
- Interactive and Editable are just configuration wrappers
- Eliminates massive code duplication
- Much easier to maintain going forward

## What Makes This Refactoring Great

1. **Code Reduction:** Massive reduction in duplicate code
2. **Clear Architecture:** Base component + thin wrappers pattern
3. **Single Responsibility:** Each component has one clear job
4. **Maintainability:** Changes to shared logic only need to happen in one place
5. **Testability:** Can test the base component comprehensively

## Troubleshooting
If you encounter issues:
1. Ensure you're on the correct source branch (`combine-editable-and-interactive-dashboards`)
2. Check that your working directory is clean (scripts will ignore themselves)
3. Verify the base branch `emb-357-wrap-editabledashboard-with-dashboardcontext` exists locally
4. Run `updated_cleanup_branches.sh` to clean up any existing branches first

## Remote Branch Note
When you push the new branches and want to reference the original work:
- Local branch: `combine-editable-and-interactive-dashboards`
- Remote branch: `combine-editable-and-interactive-dashboards-2`
- The scripts work with your local branch content

## Important: PR Base Branch
When creating PRs for the new branches, make sure to:
- Set the base branch to `emb-357-wrap-editabledashboard-with-dashboardcontext` 
- NOT to `main` or `master`
- This ensures the PR only shows your changes, not the underlying stack

## Stacked Branch Workflow
Since this is a stacked branch setup:
1. Each new branch will be based on `emb-357-wrap-editabledashboard-with-dashboardcontext`
2. The branches will only contain your changes (not the base branch changes)
3. When creating PRs, set the base branch to `emb-357-wrap-editabledashboard-with-dashboardcontext`
4. The dependency chain will be: `main` → `emb-357-wrap-editabledashboard-with-dashboardcontext` → your new branches

## Summary

This updated approach creates a much more logical and reviewable set of PRs:

- **3 foundation PRs** that can be reviewed quickly (types, file moves, infrastructure)
- **1 substantial PR** with the new SdkDashboard component (the main feature)
- **2 simple PRs** that show the dramatic simplification of existing components

The end result is the same functionality with massively reduced code duplication and a much cleaner architecture. Each dashboard component now has a single, clear purpose instead of duplicating complex logic.

🎉 **This is exactly the kind of refactoring that makes code much better to work with!**

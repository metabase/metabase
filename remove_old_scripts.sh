#!/bin/bash

echo "🧹 Cleaning up old scripts..."

# List of old scripts to remove
OLD_SCRIPTS=(
    "split_branches.sh"
    "split_main_branches.sh"
    "cleanup_split_branches.sh"
    "BRANCH_SPLITTING_INSTRUCTIONS.md"
    "show_changes.sh"
    "check_dirty.sh"
)

for script in "${OLD_SCRIPTS[@]}"; do
    if [[ -f "$script" ]]; then
        rm "$script"
        echo "✅ Deleted: $script"
    else
        echo "ℹ️  Not found: $script"
    fi
done

echo ""
echo "🎉 Cleanup complete!"
echo ""
echo "📋 Remaining scripts:"
echo "✅ updated_split_branches.sh          - Main splitting script"
echo "✅ updated_cleanup_branches.sh        - Cleanup existing branches" 
echo "✅ UPDATED_BRANCH_SPLITTING_INSTRUCTIONS.md - Complete instructions"
echo "✅ summary.sh                         - Overview of tools"
echo ""
echo "🚀 You can now run: ./updated_split_branches.sh"

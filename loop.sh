#!/bin/bash
# Ralph Wiggum Loop - Fake Sync for Redshift
#
# Each iteration: fresh context, one task, one commit
# IMPLEMENTATION_PLAN.md persists state across iterations

set -e

PROMPT_FILE="PROMPT_build.md"
MAX_ITERATIONS=20

echo "=== Ralph Wiggum Loop ==="
echo "Prompt: $PROMPT_FILE"
echo "Max iterations: $MAX_ITERATIONS"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Iteration $i of $MAX_ITERATIONS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Run Claude with the build prompt
    cat "$PROMPT_FILE" | claude --print

    # Check if all tasks are complete
    if grep -q "^\- \[x\]" IMPLEMENTATION_PLAN.md && ! grep -q "^\- \[ \]" IMPLEMENTATION_PLAN.md; then
        echo ""
        echo "All tasks complete!"
        break
    fi

    # Prompt for continuation
    echo ""
    read -p "Continue to next iteration? [Y/n] " -n 1 -r
    echo ""
    [[ $REPLY =~ ^[Nn]$ ]] && break
done

echo ""
echo "=== Loop finished ==="

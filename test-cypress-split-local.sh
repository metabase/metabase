#!/bin/bash

# Simple script to test cypress-split timing generation locally
# This bypasses all the CI complexity and tests directly

set -e

echo "=== Testing cypress-split timing generation locally ==="

# Set up environment for cypress-split
export SPLIT=1
export SPLIT_INDEX=0  
export SPLIT_FILE="./e2e/support/timings.json"
export SPLIT_OUTPUT_FILE="test-newTimes.json"
export SPLIT_TIME_THRESHOLD=0.01 # 1% variation threshold
export CYPRESS_CI=true
export MB_EDITION=ee

echo "Environment variables:"
echo "  SPLIT: $SPLIT"
echo "  SPLIT_INDEX: $SPLIT_INDEX"
echo "  SPLIT_FILE: $SPLIT_FILE"
echo "  SPLIT_OUTPUT_FILE: $SPLIT_OUTPUT_FILE"
echo "  SPLIT_TIME_THRESHOLD: $SPLIT_TIME_THRESHOLD"
echo "  CYPRESS_CI: $CYPRESS_CI"
echo "  MB_EDITION: $MB_EDITION"

# Clean up any previous timing files
rm -f "$SPLIT_OUTPUT_FILE"
echo "Cleaned up previous timing file"

# Use a single simple test file to minimize execution time
TEST_SPEC="./e2e/test/scenarios/onboarding/home.cy.spec.js"

echo "Running single test with cypress-split: $TEST_SPEC"
echo "Files before test:"
ls -la . | grep -E "(timing|newTimes)" || echo "No timing files found"

# Run cypress with minimal configuration  
OPEN_UI=false GENERATE_SNAPSHOTS=false yarn test-cypress --headless --spec "$TEST_SPEC"

echo "=== After test execution ==="
echo "Exit code: $?"
echo "Files after test:"
ls -la . | grep -E "(timing|newTimes)" || echo "No timing files found"

if [ -f "$SPLIT_OUTPUT_FILE" ]; then
    echo "SUCCESS: Timing file created!"
    echo "Content of $SPLIT_OUTPUT_FILE:"
    cat "$SPLIT_OUTPUT_FILE"
else
    echo "FAILED: No timing file generated"
    echo "Checking for any JSON files that might be timing data:"
    find . -name "*.json" -newer . 2>/dev/null | head -10
fi

echo "Done."
#!/bin/sh

# Check for empty files in staged changes
# Exit with error if any empty files are found

# Redirect output to stderr
exec 1>&2

# ANSI color codes
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get list of staged files that are being added or modified
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Flag to track if we found any empty files
EMPTY_FILES_FOUND=0

for file in $STAGED_FILES; do
    # Check if file exists and is empty
    if [ -f "$file" ] && [ ! -s "$file" ]; then
        if [ $EMPTY_FILES_FOUND -eq 0 ]; then
            echo "${RED}Error: Empty files detected in commit:${NC}"
        fi
        echo "${RED}\t$file${NC}"
        EMPTY_FILES_FOUND=1
    fi
done

if [ $EMPTY_FILES_FOUND -eq 1 ]; then
    echo "${RED}Please remove empty files before committing (add --no-verify to bypass)${NC}"
    exit 1
fi

exit 0


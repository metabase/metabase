#!/usr/bin/env bash
# Counts the number of frontend files that import from @emotion/*.
# Used to track progress migrating off Emotion onto Mantine/CSS modules.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PATTERN="from ['\"]@emotion/"

oss=$(git grep -l -E "$PATTERN" -- \
  'frontend/src/metabase/**/*.ts' \
  'frontend/src/metabase/**/*.tsx' \
  'frontend/src/metabase/**/*.js' \
  'frontend/src/metabase/**/*.jsx' | wc -l | tr -d ' ')

ee=$(git grep -l -E "$PATTERN" -- \
  'enterprise/frontend/src/metabase-enterprise/**/*.ts' \
  'enterprise/frontend/src/metabase-enterprise/**/*.tsx' \
  'enterprise/frontend/src/metabase-enterprise/**/*.js' \
  'enterprise/frontend/src/metabase-enterprise/**/*.jsx' | wc -l | tr -d ' ')

total=$((oss + ee))

echo "OSS:   $oss"
echo "EE:    $ee"
echo "Total: $total"

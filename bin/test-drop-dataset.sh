#!/usr/bin/env bash
# Test script for drop-dataset! — checks existence, drops, verifies deletion.
# Single JVM invocation to avoid startup overhead and driver loading issues.
#
# Usage:
#   ./bin/test-drop-dataset.sh                            # defaults: snowflake, test-data
#   ./bin/test-drop-dataset.sh snowflake test-data
#   ./bin/test-drop-dataset.sh bigquery-cloud-sdk test-data

set -euo pipefail

DRIVER="${1:-snowflake}"
DATASET="${2:-test-data}"

echo "=== Testing drop-dataset! for driver=$DRIVER dataset=$DATASET ==="

clojure -X:dev:drivers:drivers-dev:test \
  metabase.test.data.impl/test-drop-dataset \
  :driver "\"$DRIVER\"" \
  :dataset-name "\"$DATASET\""

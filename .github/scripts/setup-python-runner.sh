#!/bin/bash
set -e

# Parse command line arguments
SKIP_START=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-start)
      SKIP_START=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--skip-start]"
      exit 1
      ;;
  esac
done

echo "Cloning python-runner repository..."
git clone --depth 1 https://${METABASE_AUTOMATION_USER_TOKEN}@github.com/metabase/python-runner-container.git python-runner

if [ "$SKIP_START" = false ]; then
  echo "Starting python-runner..."
  cd python-runner
  make run
  cd ..
fi

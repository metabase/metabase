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
# Send the token as a header: git keeps it on the same-host redirect, but drops credentials embedded in the URL.
AUTH_HEADER="Authorization: Basic $(printf 'x-access-token:%s' "$METABASE_AUTOMATION_USER_TOKEN" | base64 -w0)"
git -c http.extraHeader="$AUTH_HEADER" clone --depth 1 https://github.com/metabase/python-runner-container.git python-runner

if [ "$SKIP_START" = false ]; then
  echo "Starting python-runner..."
  cd python-runner
  make run-ci 1> ../python-runner.out.log 2> ../python-runner.err.log
  make logs 1>> ../python-runner.out.log 2>> ../python-runner.err.log &
  cd ..
fi

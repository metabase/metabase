#!/bin/bash
set -e

echo "Cloning python-runner repository..."
git clone https://${METABASE_AUTOMATION_USER_TOKEN}@github.com/metabase/python-runner-container.git python-runner

echo "Starting python-runner..."
cd python-runner
make run

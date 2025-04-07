#!/bin/bash

set -e

# Ensure gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
  echo "GitHub CLI (gh) not found. Installing..."
  # GitHub Actions runners should have gh pre-installed, but just in case:
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  sudo apt update
  sudo apt install gh
fi

# GitHub CLI uses GITHUB_TOKEN env var automatically

echo "Searching for build-uberjars workflow run for SHA: ${HEAD_SHA}"

# First try to find a build-uberjars workflow run for this SHA
BUILD_WORKFLOW_RUN=$(gh run list --workflow build-uberjars.yml --commit ${HEAD_SHA} --json databaseId,workflowName,status -q '.[] | select(.status != "cancelled") | .databaseId' --limit 1)

if [ -z "$BUILD_WORKFLOW_RUN" ]; then
  echo "No build-uberjars.yml workflow run found for SHA: ${HEAD_SHA}"
  echo "Listing all workflows for this SHA:"

  # List all workflows and their runs for this SHA
  gh run list --commit ${HEAD_SHA} --json databaseId,workflowName,status,url

  # Try to find a build-related workflow
  echo "Looking for any build-related workflow run..."
  BUILD_WORKFLOW_RUN=$(gh run list --commit ${HEAD_SHA} --json databaseId,workflowName,status -q '.[] | select(.workflowName | contains("build") or .workflowName | contains("Build") or .workflowName | contains("uberjar") or .workflowName | contains("Uberjar")) | select(.status != "cancelled") | .databaseId' --limit 1)

  if [ -z "$BUILD_WORKFLOW_RUN" ]; then
    echo "No build-related workflow run found. Using the first non-cancelled run."
    BUILD_WORKFLOW_RUN=$(gh run list --commit ${HEAD_SHA} --json databaseId,status -q '.[] | select(.status != "cancelled") | .databaseId' --limit 1)

    if [ -z "$BUILD_WORKFLOW_RUN" ]; then
      echo "No workflow runs found for SHA: ${HEAD_SHA}"
      exit 1
    fi
  fi
fi

WORKFLOW_ID=$BUILD_WORKFLOW_RUN
echo "Found workflow run with ID: ${WORKFLOW_ID}"

# Get workflow details
WORKFLOW_NAME=$(gh run view ${WORKFLOW_ID} --json workflowName -q '.workflowName')
echo "Using workflow: $WORKFLOW_NAME (ID: $WORKFLOW_ID)"

# Get all jobs for the workflow run
echo "Getting jobs for workflow run ID: $WORKFLOW_ID"
gh run view ${WORKFLOW_ID} --json jobs --jq '.jobs[] | .name + " (ID: " + (.databaseId|tostring) + ", Status: " + .status + ")"'

# Find a suitable build job
echo "Looking for a build job..."
# Get all job data to analyze manually instead of complex jq
JOBS_JSON=$(gh run view ${WORKFLOW_ID} --json jobs -q '.jobs')

# Look for build jobs with simpler pattern matching
for pattern in "build (ee)" "build (oss)" "build-ee" "build-oss" "build"; do
  echo "Searching for jobs matching pattern: $pattern"
  BUILD_JOB_ID=$(echo "$JOBS_JSON" | jq -r --arg pattern "$pattern" '.[] | select(.name | contains($pattern)) | .databaseId')

  if [ -n "$BUILD_JOB_ID" ]; then
    BUILD_JOB_NAME=$(echo "$JOBS_JSON" | jq -r --arg id "$BUILD_JOB_ID" '.[] | select(.databaseId | tostring == $id) | .name')
    echo "Found build job: $BUILD_JOB_NAME with ID: $BUILD_JOB_ID"
    break
  fi
done

if [ -z "$BUILD_JOB_ID" ]; then
  echo "Could not find a build job in workflow run ID: $WORKFLOW_ID"
  exit 1
fi

# Wait for the job to complete
echo "Waiting for job to complete..."
COMPLETED=false

while [ "$COMPLETED" = false ]; do
  # Get fresh job data
  JOB_DATA=$(gh run view ${WORKFLOW_ID} --json jobs -q '.jobs[] | select(.databaseId | tostring == "'$BUILD_JOB_ID'")')

  # Extract status and conclusion
  JOB_STATUS=$(echo "$JOB_DATA" | jq -r '.status')
  JOB_CONCLUSION=$(echo "$JOB_DATA" | jq -r '.conclusion')

  echo "Job status: $JOB_STATUS, conclusion: $JOB_CONCLUSION"

  if [ "$JOB_STATUS" = "completed" ]; then
    if [ "$JOB_CONCLUSION" = "success" ]; then
      echo "Job completed successfully"
      COMPLETED=true
    else
      echo "Job failed with conclusion: $JOB_CONCLUSION"
      exit 1
    fi
  else
    echo "Waiting for job to complete..."
    sleep 10
  fi
done

echo "run_id=${WORKFLOW_ID}" >> $GITHUB_OUTPUT

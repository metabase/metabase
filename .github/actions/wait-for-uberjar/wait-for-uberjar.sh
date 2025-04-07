#!/bin/bash

set -e

## Get workflow run id for uberjar build
curl -Ls --output e2e-tests.json \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/run-tests.yml/runs?head_sha=${HEAD_SHA}

ID=$(jq -r '.workflow_runs[0].id' e2e-tests.json)
echo "Run ID: ${ID}"

## Get workflow run id for uberjar build
while [ -z "$JOB_ID" ]; do
  NEXT_URL="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${ID}/jobs?filter=latest"

  # Search for build job
  echo "Searching for build job..."
  while [ -z "$JOB_ID" ] && [ -n "$NEXT_URL" ]; do
    # Get one page of jobs
    RESPONSE=$(curl -s -i \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$NEXT_URL")

    # Extract headers and body
    HEADERS=$(echo "$RESPONSE" | sed -n '1,/^\r$/p')
    BODY=$(echo "$RESPONSE" | sed '1,/^\r$/d')
    LINK_HEADER=$(echo "$HEADERS" | grep -i '^link:' | sed 's/^link: //')

    # Check for next page in Link header
    if echo "$LINK_HEADER" | grep -q 'rel="next"'; then
      NEXT_URL=$(echo "$LINK_HEADER" | sed -E 's/.*<([^>]+)>; rel="next".*/\1/')
    else
      NEXT_URL=""
    fi

    # Check for build job
    JOB_ID=$(echo "$BODY" | jq -r '.jobs[] | select(.name | contains("build (ee)")) | .id')
  done
done
echo "Job ID: ${JOB_ID}"

## Wait for uberjar build to complete
while [ true ]; do
  curl -Ls --output uberjar.json \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/jobs/${JOB_ID}
  jq -r '.steps[] | select(.name == "Prepare uberjar artifact") | .status' uberjar.json | grep -q "completed" && break
  echo "Waiting for uberjar build..."
  sleep 10
done

echo "run_id=${ID}" >> $GITHUB_OUTPUT

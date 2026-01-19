#!/usr/bin/env bash

set -euo pipefail

OPENAPI_SPEC="resources/openapi/openapi.json"
AUTO_COMMIT="${AUTO_COMMIT:-false}"

# Check that $OPENAPI_SPEC matches the current Malli schema definitions

# Generate the current OpenAPI spec from Malli schemas using write-openapi-spec-to-file!
# This creates $OPENAPI_SPEC directly
# Using the generate-openapi-spec command from metabase.cmd.core
yarn generate-openapi
ret=$?

if [[ $ret -ne 0 ]]; then
        exit $ret
fi

if [[ ! -f "$OPENAPI_SPEC" ]]; then
        echo "Error: $OPENAPI_SPEC does not exist!"
        exit 1
fi

# Check if there are any differences between generated and committed versions
if ! git diff --exit-code "$OPENAPI_SPEC" >/dev/null 2>&1; then
        echo "OpenAPI schema changes detected:"
        git diff "$OPENAPI_SPEC"

        if [[ "$AUTO_COMMIT" == "true" ]]; then
                echo ""
                echo "Auto-committing changes..."

                # Get the branch name from environment variable or current branch
                BRANCH="${PR_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

                if [[ "$BRANCH" == "HEAD" ]]; then
                        echo "Error: Cannot push from detached HEAD state"
                        echo "Please ensure PR_BRANCH environment variable is set or workflow checks out the branch"
                        exit 1
                fi

                # Stash the generated spec from the merge commit
                echo "Stashing generated OpenAPI spec from merge commit..."
                cp "$OPENAPI_SPEC" "${OPENAPI_SPEC}.tmp"

                # Checkout the actual PR branch (in case we're on a merge commit)
                echo "Checking out branch: $BRANCH"
                git checkout -f "$BRANCH"

                # Restore the generated spec from the merge commit
                mv -f "${OPENAPI_SPEC}.tmp" "$OPENAPI_SPEC"

                git config user.name "github-actions[bot]"
                git config user.email "github-actions[bot]@users.noreply.github.com"
                git add "$OPENAPI_SPEC"

                # Build commit message with SHAs if available
                COMMIT_MSG="Update OpenAPI schema"
                if [[ -n "${BASE_SHA:-}" ]] && [[ -n "${HEAD_SHA:-}" ]]; then
                        BASE_SHORT=$(echo "$BASE_SHA" | cut -c1-7)
                        HEAD_SHORT=$(echo "$HEAD_SHA" | cut -c1-7)
                        COMMIT_MSG="Update OpenAPI schema (${BASE_SHORT}...${HEAD_SHORT})"
                fi

                git commit -m "$COMMIT_MSG"
                if ! git push origin "$BRANCH"; then
                        echo "Error: Failed to push OpenAPI schema update to $BRANCH."
                        exit 1
                fi
                echo "OpenAPI schema updated and pushed to $BRANCH."
                exit 0
        fi

        echo "Error: OpenAPI specs are out of date!"
        echo "The schema in $OPENAPI_SPEC does not match the current Malli schema definitions."
        echo ""
        echo "This can happen when:"
        echo "  1. You added/modified API endpoints but didn't regenerate the OpenAPI spec"
        echo "  2. Your branch is behind master, which has new API endpoints"
        echo ""
        echo "To fix this:"
        echo "  1. Pull the latest changes from master: git pull origin master"
        echo "  2. Run 'yarn generate-openapi' to update $OPENAPI_SPEC"
        echo "  3. Commit the updated openapi.json file"
        echo ""
        echo "Differences:"
        git diff "$OPENAPI_SPEC" || true
        exit 1
fi
echo "OpenAPI specs are up to date."

exit 0

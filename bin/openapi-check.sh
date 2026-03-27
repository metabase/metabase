#!/usr/bin/env bash

set -euo pipefail

OPENAPI_SPEC="resources/openapi/openapi.json"
AUTO_COMMIT="${AUTO_COMMIT:-false}"

# Check that $OPENAPI_SPEC matches the current Malli schema definitions

if [[ -n "${GITHUB_SHA:-}" ]]; then
        echo "Running OpenAPI check on commit: $GITHUB_SHA"
fi

# Generate the current OpenAPI spec from Malli schemas using write-openapi-spec-to-file!
# This creates $OPENAPI_SPEC directly
# Using the generate-openapi-spec command from metabase.cmd.core
bun run generate-openapi
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

                # Require PR_BRANCH to be set for auto-commit
                if [[ -z "${PR_BRANCH:-}" ]]; then
                        echo "Error: PR_BRANCH environment variable must be set for auto-commit"
                        exit 1
                fi

                # Stash the generated spec from the merge commit
                echo "Stashing generated OpenAPI spec from merge commit..."
                cp "$OPENAPI_SPEC" "${OPENAPI_SPEC}.tmp"

                # Checkout the actual PR branch (in case we're on a merge commit)
                echo "Checking out branch: $PR_BRANCH"
                git checkout -f "$PR_BRANCH"

                # Restore the generated spec from the merge commit
                mv -f "${OPENAPI_SPEC}.tmp" "$OPENAPI_SPEC"

                git config user.name "github-actions[bot]"
                git config user.email "github-actions[bot]@users.noreply.github.com"
                git add "$OPENAPI_SPEC"

                # Build commit message with SHAs if available
                COMMIT_MSG="Update OpenAPI schema"
                if [[ -n "${BASE_SHA:-}" ]] && [[ -n "${HEAD_SHA:-}" ]]; then
                        BASE_SHORT="${BASE_SHA:0:7}"
                        HEAD_SHORT="${HEAD_SHA:0:7}"
                        COMMIT_MSG="Update OpenAPI schema (${BASE_SHORT}...${HEAD_SHORT})"
                fi

                git commit -m "$COMMIT_MSG"
                if ! git push origin "$PR_BRANCH"; then
                        echo "Error: Failed to push OpenAPI schema update to $PR_BRANCH."
                        exit 1
                fi
                echo "OpenAPI schema updated and pushed to $PR_BRANCH."
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
        echo "  2. Run 'bun run generate-openapi' to update $OPENAPI_SPEC"
        echo "  3. Commit the updated openapi.json file"
        echo ""
        echo "Differences:"
        git diff "$OPENAPI_SPEC" || true
        exit 1
fi
echo "OpenAPI specs are up to date."

exit 0

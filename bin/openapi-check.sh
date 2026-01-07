#!/usr/bin/env bash

set -euo pipefail

OPENAPI_SPEC="resources/openapi/openapi.json"

AUTO_COMMIT=false

# Check that $OPENAPI_SPEC matches the current Malli schema definitions
# Usage: ./bin/openapi-check.sh [--auto-commit]
#   --auto-commit: Automatically commit and push changes if schema is out of date

set -euo pipefail

OPENAPI_SPEC="resources/openapi/openapi.json"

AUTO_COMMIT=false
if [[ "${1:-}" == "--auto-commit" ]]; then
        AUTO_COMMIT=true
fi

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
        if [[ "$AUTO_COMMIT" == "true" ]]; then
                echo "OpenAPI schema has changed, committing updates..."
                git config user.name "github-actions[bot]"
                git config user.email "github-actions[bot]@users.noreply.github.com"
                git add "$OPENAPI_SPEC"
                git commit -m "Update OpenAPI schema"
                git push
                echo "OpenAPI schema updated and pushed."
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

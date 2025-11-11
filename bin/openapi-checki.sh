#!/usr/bin/env bash

# Check that resources/openapi/openapi.json matches the current Malli schema definitions

set -euo pipefail

# Generate the current OpenAPI spec from Malli schemas using write-openapi-spec-to-file!
# This creates resources/openapi/openapi.json directly
# Using the generate-openapi-spec command from metabase.cmd.core
clojure -M:run:ee generate-openapi-spec
ret=$?

if [[ $ret -ne 0 ]]; then
        exit $ret
fi

if [[ ! -f "resources/openapi/openapi.json" ]]; then
        echo "Error: resources/openapi/openapi.json does not exist!"
        exit 1
fi

# Check if there are any differences between generated and committed versions
if ! git diff --exit-code resources/openapi/openapi.json >/dev/null 2>&1; then
        echo "Error: OpenAPI specs are out of date!"
        echo "The schema in resources/openapi/openapi.json does not match the current Malli schema definitions."
        echo "Please run 'yarn generate-openapi' to update resources/openapi/openapi.json."
        echo ""
        echo "Differences:"
        git diff resources/openapi/openapi.json || true
        exit 1
fi
echo "OpenAPI specs are up to date."

exit 0

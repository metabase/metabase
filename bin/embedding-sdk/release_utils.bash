#!/bin/bash
function update_readme() {
  sed -i -E 's|(embedding-sdk-)[0-9.]+|\1'"$1"'|' enterprise/frontend/src/embedding-sdk-package/README.md
  sed -i -E 's|(http://downloads.metabase.com/sdk/v)[0-9.]+|\1'"$1"'|' enterprise/frontend/src/embedding-sdk-package/README.md
}

# Version bumps now go through .github/workflows/sdk-version-bump-pr.yml
# (via the `semver` package), not this sed-based helper - removed as dead
# code (EMB-1518).

$1 $2

#!/bin/bash
# Version bumps now go through .github/workflows/sdk-version-bump-pr.yml
# (via the `semver` package), not this sed-based helper - removed as dead
# code (EMB-1518).
#
# `update_readme` was also removed (EMB-1518): both of its sed patterns
# (`embedding-sdk-<version>`, `downloads.metabase.com/sdk/v<version>`)
# matched zero occurrences in the current README - the README no longer
# contains any version-pinned content, every link uses a rolling `latest`
# pointer instead. This left the file with no remaining callers anywhere
# in the repo; it is kept as a placeholder rather than deleted outright.

$1 $2

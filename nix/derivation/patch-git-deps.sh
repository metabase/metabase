#!/usr/bin/env bash
# patch-git-deps.sh - Replace git deps in deps.edn with :local/root paths
# Usage: patch-git-deps.sh <deps.edn> <gitlibs-path>
#
# Scans the gitlibs/libs/ directory for pre-fetched git deps and replaces
# their :git/url, :git/sha, :git/tag entries in deps.edn with :local/root.

set -euo pipefail

DEPS_FILE="$1"
GITLIBS_PATH="$2"

if [ ! -f "$DEPS_FILE" ]; then
  echo "Error: $DEPS_FILE not found" >&2
  exit 1
fi

if [ ! -d "$GITLIBS_PATH/libs" ]; then
  echo "No gitlibs to patch" >&2
  exit 0
fi

# For each pre-fetched git lib, patch deps.edn
for org_dir in "$GITLIBS_PATH/libs"/*/; do
  org_name=$(basename "$org_dir")
  for lib_dir in "$org_dir"/*/; do
    lib_name=$(basename "$lib_dir")
    sha_dir=$(ls -1 "$lib_dir" | head -1)
    local_path="${lib_dir}${sha_dir}"

    coord="$org_name/$lib_name"
    echo "Patching git dep: $coord -> $local_path"

    # Use python3 for reliable multi-line EDN patching
    python3 -c "
import re, sys

with open('$DEPS_FILE', 'r') as f:
    content = f.read()

# Pattern matches the coordinate followed by its map value containing :git/ keys
# Handles both single-line and multi-line entries
coord = re.escape('$coord')
# Match: coord-name  {... :git/... ...}
# The map can span multiple lines
pattern = r'(' + coord + r'\s+)\{[^}]*:(?:git/|sha )[^}]*\}'
replacement = r'\1{:local/root \"$local_path\"}'
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

if new_content != content:
    with open('$DEPS_FILE', 'w') as f:
        f.write(new_content)
    print(f'  Patched: $coord')
else:
    print(f'  Not found in deps.edn: $coord (may be OK)')
"
  done
done

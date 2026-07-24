#!/usr/bin/env bash
# patch-mvn-repos.sh - Redirect all Maven repos in deps.edn files to local file:// repo
# Usage: patch-mvn-repos.sh <local-repo-path>
#
# For each deps.edn found under the current directory:
#   1. Replaces all remote :url values with file:// pointing to local repo
#   2. Injects "central" and "clojars" overrides into :mvn/repos
#      (tools.deps adds these as defaults; we must override them explicitly)

set -euo pipefail

LOCAL_REPO="$1"

find . -name "deps.edn" | while read -r f; do
  python3 -c "
import re

LOCAL_REPO = '$LOCAL_REPO'

with open('$f', 'r') as fh:
    content = fh.read()

original = content

# 1. Replace all existing remote :url values with file:// local repo
content = re.sub(r':url\s+\"https?://[^\"]*\"', ':url \"' + LOCAL_REPO + '\"', content)

# 2. Inject central/clojars overrides into :mvn/repos
# tools.deps merges user-provided repos with defaults, so explicit entries win
central_override = '\"central\" {:url \"' + LOCAL_REPO + '\"} \"clojars\" {:url \"' + LOCAL_REPO + '\"}'

if ':mvn/repos' in content:
    # Add central/clojars to existing :mvn/repos map (right after the opening brace)
    content = re.sub(
        r'(:mvn/repos\s*\{)',
        r'\1 ' + central_override + ' ',
        content
    )
else:
    # No :mvn/repos — inject one at the top level (after first {)
    content = content.replace('{', '{ :mvn/repos {' + central_override + '}\n', 1)

if content != original:
    with open('$f', 'w') as fh:
        fh.write(content)
    print(f'  Patched mvn repos in: $f')
"
done

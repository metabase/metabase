#!/bin/bash
# Generate a corpus entry from a fix commit.
# Usage: make-entry.sh <issue> <fix-commit-sha>
# Creates bugs/<issue>/{record.yaml,inverse.patch} and adds the entry's line to bugs/INDEX.jsonl.
# The patch is the fix's diff without its test files, and applying it in reverse reintroduces the bug.
set -eu
REPO_ROOT=${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}
BUGS="$REPO_ROOT/e2e/regression-corpus/bugs"
cd "${CORPUS_WORKTREE:-$REPO_ROOT}"
ISSUE="$1"; COMMIT="$2"
DIR="$BUGS/$ISSUE"
mkdir -p "$DIR"

EXCLUDES=(':(exclude)e2e/*' ':(exclude)test/*' ':(exclude)enterprise/backend/test/*'
  ':(exclude)frontend/test/*' ':(exclude)*_test.clj' ':(exclude)*_test.cljc'
  ':(exclude)*.unit.spec.js' ':(exclude)*.unit.spec.ts' ':(exclude)*.unit.spec.tsx'
  ':(exclude)*.spec.ts' ':(exclude)*.spec.tsx' ':(exclude)*.spec.js'
  ':(exclude)*.stories.tsx' ':(exclude)docs/*' ':(exclude)dev/*')

git diff "$COMMIT^" "$COMMIT" -- "${EXCLUDES[@]}" > "$DIR/inverse.patch"
[ -s "$DIR/inverse.patch" ] || { echo "ERROR: product diff empty (test-only commit)"; exit 1; }

status=stale
git apply -R --check "$DIR/inverse.patch" 2>/dev/null && status=pending
fix_commit=$(git rev-parse "$COMMIT^{commit}")
base_commit=$(git rev-parse --short=11 HEAD)

cat > "$DIR/record.yaml" <<EOF
id: reg-$ISSUE
origin:
  kind: regression
  issue: $ISSUE
  fix_commit: $fix_commit
  fix_tests:
    - "TODO"
bug:
  statement: "TODO"
  odc: {type: TODO, qualifier: TODO}
  module: TODO
  lowest_level: TODO
  stratum: TODO
  fe_be_boundary: TODO
mutant:
  base_commit: "$base_commit"
  patch: inverse.patch
  method: inverse
  status: $status
  retired_reason: null
hint:
  test: "TODO"
  expected_failure: "TODO"
notes: "inverse.patch is the fix diff without its test files; apply it with \`git apply -R\` to reintroduce the bug"
EOF

INDEX="$BUGS/INDEX.jsonl"
{ grep -v "\"issue\": $ISSUE," "$INDEX" || true
  echo "{\"id\": \"reg-$ISSUE\", \"issue\": $ISSUE, \"module\": \"TODO\", \"stratum\": \"TODO\", \"lowest_level\": \"TODO\", \"fe_be_boundary\": \"TODO\", \"patch\": \"inverse.patch\", \"hint_kind\": \"TODO\", \"alias_of\": null}"
} | sort -t: -k3,3n > "$INDEX.tmp"
mv "$INDEX.tmp" "$INDEX"
echo "created $DIR (status: $status), fill in the TODO fields in record.yaml and its INDEX.jsonl line"

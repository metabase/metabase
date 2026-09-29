#!/bin/bash
# Generate a corpus entry from a fix commit.
# Usage: make-entry.sh <issue> <fix-commit-sha>
# Creates bugs/<issue>/{config.yaml,inverse.patch}. The patch is the fix's product-code
# diff (test files excluded); applying it in reverse reintroduces the bug.
set -eu
REPO_ROOT=${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}
CORPUS_OUT=${CORPUS_OUT:-$REPO_ROOT/local/regression-corpus/overnight}
BUGS="$REPO_ROOT/e2e/regression-corpus/bugs"
DATA="$CORPUS_OUT/july-corpus"
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

applies=false
git apply -R --check "$DIR/inverse.patch" 2>/dev/null && applies=true
base_sha=$(git rev-parse HEAD)
subject=$(git log -1 --format='%s' "$COMMIT")
fix_pr=$(printf '%s' "$subject" | grep -oE '#[0-9]+\)?$' | grep -oE '[0-9]+' || echo null)

# repro tests currently guarding this issue
node -e '
const fs=require("fs");
const issue=+process.argv[1];
const rows=fs.readFileSync(process.argv[3],"utf8").trim().split("\n").map(JSON.parse);
const mine=rows.filter(r=>r.issues.includes(issue));
const yaml=mine.map(r=>`    - spec: ${r.spec}\n      line: ${r.line}\n      kind: ${r.kind}\n      title: ${JSON.stringify(r.title)}`).join("\n");
fs.writeFileSync(process.argv[2], yaml+"\n");
' "$ISSUE" "$DIR/.repro_tests.yaml" "$DATA/repro-tests.jsonl"

cat > "$DIR/config.yaml" <<EOF
issue: $ISSUE
issue_url: https://github.com/metabase/metabase/issues/$ISSUE
fix_commits: ["$COMMIT"]
fix_pr: $fix_pr
fix_subject: $(printf '%s' "$subject" | sed 's/\\/\\\\/g; s/"/\\"/g' | sed 's/^/"/;s/$/"/')
area: null
fe_be_boundary: null

mutation:
  kind: patch
  patch_file: inverse.patch
  notes: null
  base_sha: "$base_sha"
  applies_cleanly: $applies
  breaks_compile: null

validation:
  repro_tests:
$(cat "$DIR/.repro_tests.yaml")
  green_baseline: untested
  repro_confirmed: null

coverage:
  be_unit: {status: untested, killed_by: []}
  fe_unit: {status: untested, killed_by: []}
  notes: null
EOF
rm "$DIR/.repro_tests.yaml"
echo "created $DIR (applies_cleanly=$applies)"

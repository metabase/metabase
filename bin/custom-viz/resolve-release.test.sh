#!/usr/bin/env bash
# Smoke tests for bin/custom-viz/resolve-release.sh. Runs the script against
# ad-hoc package.json fixtures and asserts stdout / exit status.
#
# Run from the repo root:
#   ./bin/custom-viz/resolve-release.test.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOLVER="$SCRIPT_DIR/resolve-release.sh"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

fail=0
pass=0

run_case() {
  local name="$1"
  local branch="$2"
  local version="$3"
  local expect_exit="$4"
  local expect_stdout="$5"

  local pkg="$TMPDIR/case.json"
  printf '{"name":"@metabase/custom-viz","version":"%s"}\n' "$version" > "$pkg"

  local stdout
  stdout=$(CUSTOM_VIZ_PKG="$pkg" BRANCH="$branch" "$RESOLVER" 2>/dev/null)
  local actual_exit=$?

  if [ "$actual_exit" != "$expect_exit" ]; then
    echo "FAIL [$name]: exit $actual_exit, want $expect_exit"
    echo "  stdout: $stdout"
    fail=$((fail + 1))
    return
  fi

  if [ -n "$expect_stdout" ] && [ "$stdout" != "$expect_stdout" ]; then
    echo "FAIL [$name]: stdout mismatch"
    echo "  want: $expect_stdout"
    echo "  got:  $stdout"
    fail=$((fail + 1))
    return
  fi

  echo "ok   [$name]"
  pass=$((pass + 1))
}

# master: canary accepted; NN patch 0 only.
run_case "master-canary-ok" master "0.61.0-canary.0" 0 \
"version=0.61.0-canary.0
npm_tag=canary
git_tag=custom-viz-v0.61.0-canary.0
stable_tag="

run_case "master-canary-high" master "0.61.0-canary.42" 0 \
"version=0.61.0-canary.42
npm_tag=canary
git_tag=custom-viz-v0.61.0-canary.42
stable_tag="

run_case "master-stable-rejected" master "0.61.0" 1 ""
run_case "master-patch-nonzero-rejected" master "0.61.1-canary.0" 1 ""
run_case "master-beta-rejected" master "0.61.0-beta.0" 1 ""
run_case "master-alpha-rejected" master "0.61.0-alpha.0" 1 ""

# release-x.NN.x: stable + beta accepted; major must match branch.
run_case "release-stable-ok" "release-x.61.x" "0.61.0" 0 \
"version=0.61.0
npm_tag=61-stable
git_tag=custom-viz-v0.61.0
stable_tag=custom-viz-61-stable"

run_case "release-stable-patch-ok" "release-x.61.x" "0.61.3" 0 \
"version=0.61.3
npm_tag=61-stable
git_tag=custom-viz-v0.61.3
stable_tag=custom-viz-61-stable"

run_case "release-beta-rejected" "release-x.61.x" "0.61.0-beta.2" 1 ""
run_case "release-major-mismatch-rejected" "release-x.60.x" "0.61.0" 1 ""
run_case "release-canary-rejected" "release-x.61.x" "0.61.0-canary.0" 1 ""

# Bad inputs.
run_case "unknown-branch-rejected" "feature-foo" "0.61.0" 1 ""
run_case "legacy-0.0.1-rejected" master "0.0.1-canary.16" 1 ""
run_case "unprefixed-version-rejected" master "1.61.0-canary.0" 1 ""
run_case "empty-version-rejected" master "" 1 ""

echo
echo "passed: $pass"
echo "failed: $fail"
[ "$fail" -eq 0 ]

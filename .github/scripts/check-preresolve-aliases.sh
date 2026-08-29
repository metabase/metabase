#!/usr/bin/env bash
# Fails when a Clojure classpath used by CI is not pre-resolved by cache-warm.
#
# tools.deps selects dependency versions globally per classpath, so two alias combinations can resolve
# the same transitive library to different versions. A combination the warm job never resolved is
# therefore not merely absent from the cache - the cache holds *a* version of those libraries, just not
# the one this classpath wants, and the job fetches its delta straight from Maven Central on every run.
# That is the intermittent-403 failure of DEV-2094, and it is invisible: the build still passes.
#
# Nothing about a missing combination shows up at runtime, so this check is the only thing standing
# between a newly added alias combination and a permanently half-cold cache.
#
#   .github/scripts/check-preresolve-aliases.sh

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

WARM=.github/workflows/cache-warm.yml

# Invocations deliberately left out of the warm job. Each needs a reason, because the default answer is
# to add the combination to the list instead.
WAIVED="$(
  cat <<'EOF'
:deps
:outdated
EOF
)"
# :deps      - tools.deps built-in used by write-poms.sh; contributes no dependencies of its own.
# :outdated  - scheduled dependency-bump workflow only; a cold resolve there costs nothing anyone waits on.

# Dependency roots and alias combinations the warm job pre-resolves.
declared="$({
  sed -n '/^[[:space:]]*combos=(/,/^ *)/p' "$WARM" \
    | grep -oE '":[^"]*"' \
    | tr -d '"' \
    | sed 's#^#.|#'
  sed -n '/^[[:space:]]*nested_combos=(/,/^ *)/p' "$WARM" \
    | grep -oE '"[^"]+\|:[^"]+"' \
    | tr -d '"'
} | sort -u)"
if [ -z "$declared" ]; then
  echo "::error::check-preresolve-aliases.sh: found no pre-resolved classpaths in $WARM" >&2
  exit 1
fi

# Expressions we know how to expand. An unrecognised one has to stop the check rather than be skipped:
# silently ignoring it is how a whole matrix of combinations would go unchecked.
unknown="$(grep -rhoE '\$\{\{[^}]*\}\}' --include='*' \
             --exclude='*.png' --exclude='*.jpg' .github/ 2>/dev/null \
           | sort -u | grep -v 'edition' || true)"

scan() { # scan <edition>: dependency root and aliases used by .github Clojure invocations
  grep -rhE 'clojure[[:space:]]+(-P[[:space:]]+)?-[XMATP]?:' \
       --include='*' --exclude='*.png' --exclude='*.jpg' .github/ 2>/dev/null \
    | sed "s/\\\${{[^}]*edition[^}]*}}/$1/g" \
    | grep -oE 'clojure[[:space:]]+(-P[[:space:]]+)?-[XMATP]?:[A-Za-z0-9:_./-]+' \
    | grep -oE ':[A-Za-z0-9:_./-]+' \
    | sed -e 's/:$//' -e 's#^#.|#'
}

scan_project_tests() { # scan_project_tests <function> <dependency-root>
  sed -n "/(defn- $1 /,/^(defn/p" mage/src/mage/project_tests.clj \
    | tr '\n' ' ' \
    | grep -oE '"clojure"[[:space:]]+("-P"[[:space:]]+)?"-[XMATP]?:[A-Za-z0-9:_./-]+' \
    | grep -oE ':[A-Za-z0-9:_./-]+' \
    | sed -e 's/:$//' -e "s#^#$2|#"
}

found="$( {
  scan ee
  scan oss
  scan_project_tests run-clojure-checks! .
  scan_project_tests run-migration-checks! bin/lint-migrations-file
  # build-scripts.yml runs this classpath from its own dependency root.
  printf '%s\n' 'bin/load-namespaces|:test'
} | sort -u )"

covered="$( {
  printf '%s\n' "$declared"
  printf '%s\n' "$WAIVED" | sed 's#^#.|#'
} | sort -u)"
missing="$(comm -23 <(printf '%s\n' "$found") <(printf '%s\n' "$covered") || true)"

if [ -n "$missing" ]; then
  echo "::error::Clojure classpaths used by CI that cache-warm does not pre-resolve:" >&2
  printf '%s\n' "$missing" | sed 's/^/  /' >&2
  echo >&2
  echo "Add each to the matching root or nested combo list in $WARM, or waive it here with a reason." >&2
  echo "Leaving it uncovered means those jobs re-fetch their version deltas from Maven on every run." >&2
  exit 1
fi

echo "All $(printf '%s\n' "$found" | grep -c .) Clojure classpaths used by CI are pre-resolved."

#!/usr/bin/env bash
# Fails when a `clojure` invocation under .github/ uses an alias combination that cache-warm does not
# pre-resolve.
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

# Alias combinations the warm job pre-resolves.
declared="$(sed -n '/combos=(/,/^ *)/p' "$WARM" | grep -oE '":[^"]*"' | tr -d '"' | sort -u)"
if [ -z "$declared" ]; then
  echo "::error::check-preresolve-aliases.sh: found no combos=( ... ) list in $WARM" >&2
  exit 1
fi

# Expressions we know how to expand. An unrecognised one has to stop the check rather than be skipped:
# silently ignoring it is how a whole matrix of combinations would go unchecked.
unknown="$(grep -rhoE '\$\{\{[^}]*\}\}' --include='*' \
             --exclude='*.png' --exclude='*.jpg' .github/ 2>/dev/null \
           | sort -u | grep -v 'edition' || true)"

scan() { # scan <edition>: alias strings used by clojure invocations, with expressions substituted
  grep -rhE 'clojure[[:space:]]+(-P[[:space:]]+)?-[XMATP]?:' \
       --include='*' --exclude='*.png' --exclude='*.jpg' .github/ 2>/dev/null \
    | sed "s/\\\${{[^}]*edition[^}]*}}/$1/g" \
    | grep -oE 'clojure[[:space:]]+(-P[[:space:]]+)?-[XMATP]?:[A-Za-z0-9:_.-]+' \
    | grep -oE ':[A-Za-z0-9:_.-]+' \
    | sed 's/:$//'
}

found="$( { scan ee; scan oss; } | sort -u )"

covered="$(printf '%s\n%s\n' "$declared" "$WAIVED" | sort -u)"
missing="$(comm -23 <(printf '%s\n' "$found") <(printf '%s\n' "$covered") || true)"

if [ -n "$missing" ]; then
  echo "::error::Alias combinations used under .github/ that cache-warm does not pre-resolve:" >&2
  printf '%s\n' "$missing" | sed 's/^/  /' >&2
  echo >&2
  echo "Add each to the combos list in $WARM, or waive it in this script with a reason." >&2
  echo "Leaving it uncovered means those jobs re-fetch their version deltas from Maven on every run." >&2
  exit 1
fi

echo "All $(printf '%s\n' "$found" | grep -c .) clojure alias combinations under .github/ are pre-resolved."

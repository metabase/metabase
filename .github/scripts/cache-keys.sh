#!/usr/bin/env bash
# Single definition of every CI dependency cache: what it holds, what identifies it, what it falls back to.
#
# A GitHub cache entry is identified by its key, a hash of the declared path list, and the ref that saved
# it. A step declaring a different path list than the one a cache was saved with computes a different
# identity and can never match it, whatever its key says. So paths and keys are emitted together here and
# every cache step takes both from this script.
#
# Emits `name=value` lines in $GITHUB_OUTPUT format:
#
#   .github/scripts/cache-keys.sh >> "$GITHUB_OUTPUT"
#
# Run it with no redirect to see the whole scheme, or pass one name to print a single value:
#
#   .github/scripts/cache-keys.sh
#   .github/scripts/cache-keys.sh m2-key
#
# Hashes are computed here rather than with GitHub's hashFiles() so that a local run and a CI run of the
# same commit produce the same keys, and so that an empty match can fail loudly - a hashFiles() call that
# matches nothing silently yields "", collapsing the key onto its own restore prefix and pointing every
# dependency set at one entry.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OS="${RUNNER_OS:-$(uname -s)}"
[ "$OS" = "Darwin" ] && OS="macOS"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d' ' -f1
  else
    shasum -a 256 | cut -d' ' -f1
  fi
}

# Digest of a set of files: hash each one, then hash the concatenation, so the result depends on every
# file's contents and on which files exist.
digest() {
  local f
  if [ "$#" -eq 0 ]; then
    echo "::error::cache-keys.sh: no files matched; refusing to emit a key that would collide across dependency sets" >&2
    exit 1
  fi
  for f in "$@"; do
    [ -f "$f" ] || { echo "::error::cache-keys.sh: $f does not exist" >&2; exit 1; }
    sha256 < "$f"
  done | sha256
}

shopt -s nullglob
DEPS_FILES=(deps.edn
            bin/lint-migrations-file/deps.edn
            bin/load-namespaces/deps.edn
            modules/drivers/deps.edn
            modules/drivers/*/deps.edn)
shopt -u nullglob

DEPS_HASH="$(digest "${DEPS_FILES[@]}")"
LOCK_HASH="$(digest bun.lock)"

# The Cypress binary depends on the Cypress version alone, so keying it on the whole lockfile would
# throw away a 200MB download every time any frontend dependency moved.
#
# Reading a version out of a lockfile with a regex is only safe while exactly one line matches. Insist
# on that rather than taking the first of several: a second match means the format moved under us, and
# picking one at random would key the binary under a version it is not.
CYPRESS_VERSIONS="$(sed -n 's/.*"cypress": \["cypress@\([^"]*\)".*/\1/p' bun.lock)"
CYPRESS_MATCHES="$(printf '%s\n' "$CYPRESS_VERSIONS" | grep -c . || true)"
if [ "$CYPRESS_MATCHES" != "1" ]; then
  echo "::error::cache-keys.sh: expected exactly one resolved cypress version in bun.lock, found $CYPRESS_MATCHES" >&2
  exit 1
fi
CYPRESS_VERSION="$CYPRESS_VERSIONS"

# The Clojure CLI version CI installs. It lives here rather than in prepare-backend so that the version
# and the key that identifies its cache entry cannot drift apart.
CLOJURE_VERSION="1.12.0.1488"

# An incremental lint cache is only ever an accelerator, so it keys on the commit and always falls back
# to the newest entry on the prefix. The exact key never pre-exists, which keeps the entry current.
ESLINT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"

emit_multiline() {
  local name="$1"; shift
  printf '%s<<CACHE_KEYS_EOF\n' "$name"
  printf '%s\n' "$@"
  printf 'CACHE_KEYS_EOF\n'
}

# Paths under the home directory are emitted absolute rather than as `~/...`. actions/cache would expand
# a tilde, but a shell assigning one of these to a variable would not, and would go on to create a
# directory named `~`. Paths inside the checkout stay relative; actions/cache resolves those against the
# workspace.
spec() {
  emit_multiline m2-path "$HOME/.m2" "$HOME/.gitlibs" "$HOME/.deps.clj" 'bin/bb'
  echo "m2-key=M2-$OS-$DEPS_HASH"
  echo "m2-restore-key=M2-$OS-"

  # Pinned rather than discovered via `bun pm cache` so that the path is known before bun is installed;
  # prepare-frontend exports BUN_INSTALL_CACHE_DIR to match and fails if bun disagrees.
  echo "bun-store-path=$HOME/.bun/install/cache"
  echo "bun-store-key=bun-store-$OS-$LOCK_HASH"
  echo "bun-store-restore-key=bun-store-$OS-"

  # No restore-key: an entry from another version installs a working `clojure` of the wrong version, and
  # the freshness check in prepare-backend - running the binary - would accept it.
  #
  # The installer bakes this prefix into the clj/clojure shims, so the tree only works when restored to
  # the same absolute path it was built at; prepare-backend reinstalls when it is not.
  echo "clojure-path=$HOME/.clojure-cli"
  echo "clojure-key=clojure-cli-$OS-$CLOJURE_VERSION"
  echo "clojure-version=$CLOJURE_VERSION"

  echo "cypress-path=$HOME/.cache/Cypress"
  echo "cypress-key=cypress-$OS-$CYPRESS_VERSION"
  echo "cypress-restore-key=cypress-$OS-"

  echo "eslint-path=.eslintcache"
  echo "eslint-key=eslint-$OS-$ESLINT_SHA"
  echo "eslint-restore-key=eslint-$OS-"
}

# Print one output's value, including the multiline form, and fail on a name that does not exist. A
# caller that silently received "" would go on to build a key with a hole in it.
query() {
  local want="$1" line delim found=0 in_block=0
  while IFS= read -r line; do
    if [ "$in_block" = 1 ]; then
      if [ "$line" = "$delim" ]; then
        in_block=0
      else
        printf '%s\n' "$line"
      fi
      continue
    fi
    case "$line" in
      "$want="*)
        printf '%s\n' "${line#*=}"
        found=1
        ;;
      "$want<<"*)
        delim="${line#*<<}"
        in_block=1
        found=1
        ;;
    esac
  done <<EOF
$(spec)
EOF
  if [ "$found" = 0 ]; then
    echo "::error::cache-keys.sh: no output named '$want'" >&2
    exit 1
  fi
}

if [ "$#" -eq 0 ]; then
  spec
else
  query "$1"
fi

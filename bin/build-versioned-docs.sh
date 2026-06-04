#!/usr/bin/env bash
#
# build-versioned-docs.sh
#
# Extract the docs/ directory from many release branches and lay each one out
# under build/<version>/ :
#
#     master            -> build/latest/
#     release-x.NN.x    -> build/NN/        (NN from 12..62 by default)
#
# PERFORMANCE
#   * No working-tree checkouts. Each version is pulled with `git archive`
#     (reads packed objects directly, never touches the index or HEAD).
#   * Planning is near-free: all ref resolution is one `git for-each-ref` plus
#     pure-bash membership tests, and every docs/-presence check is a single
#     `git cat-file --batch-check` pass -- no per-version subprocess fan-out.
#   * Extraction runs concurrently across every CPU core via an xargs worker
#     pool. Each lane re-execs this script in --worker mode, so there is no
#     shell-function export (works on macOS bash 3.2 and modern bash alike).
#   * Zero network by default: only refs already present locally are used.
#     Pass FETCH=1 to consult the remote once and shallow-fetch any missing
#     versions that actually exist there.
#
# USAGE
#   bin/build-versioned-docs.sh
#
# ENV OVERRIDES (all optional)
#   BUILD_DIR=path   output root                    (default: <repo>/build)
#   MIN_VER / MAX_VER  release number range         (default: 12 / 62)
#   REMOTE=name      git remote to resolve against  (default: origin)
#   DOCS_PATH=path   subtree to export              (default: docs)
#   STRIP=0|1        drop the leading docs/ prefix  (default: 1)
#   FETCH=0|1        shallow-fetch missing versions (default: 0)
#   CLEAN=0|1        wipe BUILD_DIR before building (default: 0)
#   INCREMENTAL=0|1  skip versions whose docs tree  (default: 0)
#                    is unchanged since last build (great for reruns)
#   JOBS=n           parallel lanes                 (default: CPU count)
#
set -euo pipefail

# Absolute path to this script, captured BEFORE any cd, so the parallel worker
# lanes can re-exec it regardless of how/where it was invoked.
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)/$(basename "${BASH_SOURCE[0]}")"

# Operate from the repo root so git and relative paths behave identically in
# the main process and in every worker lane.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "fatal: not inside a git repository" >&2; exit 1; }
cd "$REPO_ROOT"

# ---- configuration (env-overridable) ----
REMOTE="${REMOTE:-origin}"
DOCS_PATH="${DOCS_PATH:-docs}"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/build}"
MIN_VER="${MIN_VER:-12}"
MAX_VER="${MAX_VER:-62}"
STRIP="${STRIP:-1}"
FETCH="${FETCH:-0}"
CLEAN="${CLEAN:-0}"
INCREMENTAL="${INCREMENTAL:-0}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"

# tar --strip-components depth = number of path components in DOCS_PATH, so that
# build/<version>/ holds the docs *contents* (e.g. build/55/index.md).
DOCS_PATH="${DOCS_PATH%/}"
STRIP_COMPONENTS="$(awk -F/ '{print NF}' <<<"$DOCS_PATH")"

# ===========================================================================
# Worker lane: invoked as `bash "$SELF" --worker <label> <ref>` by xargs.
# Inherits configuration from the environment of the main process.
# ===========================================================================
if [[ "${1:-}" == "--worker" ]]; then
  label="$2"; ref="$3"
  dest="$BUILD_DIR/$label"
  tmp="$BUILD_DIR/.tmp.$label.$$"
  stamp="$BUILD_DIR/.stamps/$label"
  trap 'rm -rf "$tmp"' EXIT

  # Incremental: release-branch docs are immutable, so skip re-extraction when
  # the docs tree object is byte-identical to the last build of this version.
  oid="$(git rev-parse -q --verify "$ref:$DOCS_PATH" 2>/dev/null || true)"
  if [[ "$INCREMENTAL" == "1" && -n "$oid" && -d "$dest" && -f "$stamp" ]]; then
    read -r prev <"$stamp" || prev=""
    if [[ "$prev" == "$oid" ]]; then
      printf '  = %-7s <- %-34s  (cached)\n' "$label" "$ref"
      exit 0
    fi
  fi

  rm -rf "$tmp"; mkdir -p "$tmp"
  # git archive streams the docs subtree straight into tar -- no checkout.
  if [[ "$STRIP" == "1" ]]; then
    git archive "$ref" "$DOCS_PATH" | tar -x -f - -C "$tmp" --strip-components="$STRIP_COMPONENTS"
  else
    git archive "$ref" "$DOCS_PATH" | tar -x -f - -C "$tmp"
  fi
  # Atomic-ish swap so reruns are clean and interrupted lanes leave no half dir.
  rm -rf "$dest"; mv "$tmp" "$dest"
  if [[ "$INCREMENTAL" == "1" && -n "$oid" ]]; then
    mkdir -p "$BUILD_DIR/.stamps"; printf '%s\n' "$oid" >"$stamp"
  fi

  printf '  + %-7s <- %-34s  %5s files\n' \
    "$label" "$ref" "$(find "$dest" -type f | wc -l | tr -d ' ')"
  exit 0
fi

# ---- help ----
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,38p' "$SELF"; exit 0
fi

# ===========================================================================
# Main: plan which (label, ref) pairs to build, then fan them out.
# ===========================================================================
SECONDS=0

# One-shot snapshot of every local ref. Membership tests below are pure bash
# substring matches against this string -- no `git rev-parse` per version.
snapshot_refs() {
  ALL_REFS_NL=$'\n'"$(git for-each-ref --format='%(refname)' \
    "refs/remotes/$REMOTE/" refs/heads/)"$'\n'
}
ref_exists() { [[ "$ALL_REFS_NL" == *$'\n'"$1"$'\n'* ]]; }

# Resolve a branch name to a usable ref, preferring the remote-tracking copy.
resolve_ref() {
  local name="$1"
  if ref_exists "refs/remotes/$REMOTE/$name"; then echo "refs/remotes/$REMOTE/$name"; return 0; fi
  if ref_exists "refs/heads/$name";          then echo "refs/heads/$name";          return 0; fi
  return 1
}

# Confirm the docs subtree exists in many refs with ONE git pass.
# Args: refs...  -> echoes "1" (present) / "0" (absent), one line per ref, in order.
docs_presence() {
  (($#)) || return 0
  local r
  for r in "$@"; do printf '%s:%s\n' "$r" "$DOCS_PATH"; done \
    | git cat-file --batch-check='%(objecttype)' 2>/dev/null \
    | awk '{ print ($NF == "missing") ? 0 : 1 }'
}

# Compact a sorted list of ints into "12-36, 39, 41-62".
compact_ranges() {
  local nums=("$@") out="" start prev i n
  ((${#nums[@]})) || { echo ""; return; }
  start="${nums[0]}"; prev="${nums[0]}"
  for ((i = 1; i < ${#nums[@]}; i++)); do
    n="${nums[$i]}"
    if ((n == prev + 1)); then prev="$n"; continue; fi
    (( start == prev )) && out+="${start}, " || out+="${start}-${prev}, "
    start="$n"; prev="$n"
  done
  (( start == prev )) && out+="${start}" || out+="${start}-${prev}"
  echo "$out"
}

# Desired versions: master -> latest, then each release number.
labels=("latest"); branches=("master")
for ((n = MIN_VER; n <= MAX_VER; n++)); do
  labels+=("$n"); branches+=("release-x.${n}.x")
done

snapshot_refs

# Optionally reach the remote ONCE to recover versions missing locally, before
# the real resolution pass (so the rest of the planning stays uniform).
if [[ "$FETCH" == "1" ]]; then
  missing=()
  for i in "${!branches[@]}"; do
    name="${branches[$i]}"
    ref_exists "refs/remotes/$REMOTE/$name" || ref_exists "refs/heads/$name" \
      || missing+=("$name")
  done
  if ((${#missing[@]})); then
    echo "Consulting $REMOTE for ${#missing[@]} missing branch(es)..."
    remote_heads="$(git ls-remote --heads "$REMOTE" 2>/dev/null | sed -E 's#.*refs/heads/##')"
    to_fetch=()
    for name in "${missing[@]}"; do
      grep -qxF "$name" <<<"$remote_heads" && to_fetch+=("$name") || true
    done
    if ((${#to_fetch[@]})); then
      echo "Shallow-fetching ${#to_fetch[@]}: ${to_fetch[*]}"
      git fetch --no-tags --depth=1 "$REMOTE" "${to_fetch[@]}"
      snapshot_refs
    fi
  fi
fi

# Single resolution pass (pure bash) -> candidate refs + unresolved names.
cand_labels=(); cand_refs=(); unresolved_labels=()
for i in "${!branches[@]}"; do
  label="${labels[$i]}"; name="${branches[$i]}"
  if ref="$(resolve_ref "$name")"; then
    cand_labels+=("$label"); cand_refs+=("$ref")
  else
    unresolved_labels+=("$label")
  fi
done

# Single docs/-presence pass (one git process) -> buildable vs no-docs.
build_labels=(); build_refs=(); nodocs=()
if ((${#cand_refs[@]})); then
  present=()
  while IFS= read -r flag; do present+=("$flag"); done < <(docs_presence "${cand_refs[@]}")
  for i in "${!cand_refs[@]}"; do
    if [[ "${present[$i]:-0}" == "1" ]]; then
      build_labels+=("${cand_labels[$i]}"); build_refs+=("${cand_refs[$i]}")
    else
      nodocs+=("${cand_labels[$i]}")
    fi
  done
fi

# Split unresolved into numeric (compactable) vs other for a tidy summary.
notfound_nums=(); notfound_other=()
for label in ${unresolved_labels[@]+"${unresolved_labels[@]}"}; do
  if [[ "$label" =~ ^[0-9]+$ ]]; then notfound_nums+=("$label"); else notfound_other+=("$label"); fi
done

if ((${#build_labels[@]} == 0)); then
  echo "Nothing buildable (no requested versions resolved)." >&2
  exit 1
fi

# Optional clean slate.
if [[ "$CLEAN" == "1" && -n "$BUILD_DIR" && "$BUILD_DIR" != "/" ]]; then
  rm -rf "$BUILD_DIR"
fi
mkdir -p "$BUILD_DIR"

echo "Extracting ${#build_labels[@]} version(s) of $DOCS_PATH/ into $BUILD_DIR on $JOBS lanes..."

# Fan out: emit label/ref pairs, one field per line, and let xargs run up to
# $JOBS workers at once. pipefail surfaces a worker failure as a non-zero rc,
# which we capture without aborting so the summary still prints.
rc=0
{
  for i in "${!build_labels[@]}"; do
    printf '%s\n%s\n' "${build_labels[$i]}" "${build_refs[$i]}"
  done
} | xargs -P "$JOBS" -n2 bash "$SELF" --worker || rc=$?

# ---- summary ----
echo
echo "Built ${#build_labels[@]} version(s) -> $BUILD_DIR  (${SECONDS}s)"
if ((${#nodocs[@]})); then
  echo "Skipped ${#nodocs[@]} with no $DOCS_PATH/ subtree: ${nodocs[*]}"
fi
if ((${#notfound_nums[@]} || ${#notfound_other[@]})); then
  msg="$(compact_ranges ${notfound_nums[@]+"${notfound_nums[@]}"})"
  [[ -n "$msg" && ${#notfound_other[@]} -gt 0 ]] && msg+=", "
  msg+="${notfound_other[*]:-}"
  echo "Skipped (branch not found on $REMOTE; pass FETCH=1 to try harder): $msg"
fi
if ((rc != 0)); then
  echo "WARNING: at least one lane failed (xargs rc=$rc)." >&2
  exit "$rc"
fi

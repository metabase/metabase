#!/usr/bin/env bash
#
# render-versioned-docs.sh
#
# Render every pre-extracted docs version under build/<version>/ (produced by
# bin/build-versioned-docs.sh) into a single static site under build/docs/ :
#
#     build/latest/   -> build/docs/latest/    (base path /docs/latest)
#     build/55/       -> build/docs/v0.55/     (base path /docs/v0.55)
#
# It drives the docs-build/ Astro app once per version, pointing it at that
# version's markdown via DOCS_CONTENT_DIR and its URL prefix via DOCS_BASE_PATH
# (both honored by docs-build/astro.config.mjs + src/content.config.ts). Each
# build goes to docs-build/dist/ (in-cwd — Astro's image pipeline mishandles an
# out-of-tree outDir) and is then rsynced to its versioned home, exactly like
# `./bin/mage docs-build-branch`.
#
# Builds are serialized: a single Astro app dir can't be built concurrently
# (shared .astro content store + dist). A bare per-version build is ~6s.
#
# USAGE
#   bin/render-versioned-docs.sh                 # every version in build/
#   bin/render-versioned-docs.sh latest 55 62    # only these
#
# ENV OVERRIDES (all optional)
#   BUILD_DIR=path   where the extracted version dirs live (default <repo>/build)
#   SITE_DIR=path    output site root              (default $BUILD_DIR/docs)
#   SEED=latest|all|none  seed gitignored generated artifacts (api.json, SDK
#                    typedoc) from the live ./docs into the content dir before
#                    building. 'latest' (default) seeds only the latest build
#                    (accurate); 'all' seeds every version (current-version API
#                    reference, not historically faithful); 'none' leaves the
#                    API page as a "not generated" notice + SDK placeholders.
#   DOCS_SITE_URL=url  absolute site URL for canonicals/sitemap (default unset)
#   KEEP_CACHE=0|1   reuse Astro caches across versions (faster, risks staleness)
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "fatal: not inside a git repository" >&2; exit 1; }
cd "$REPO_ROOT"

BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/build}"
SITE_DIR="${SITE_DIR:-$BUILD_DIR/docs}"
DOCS_BUILD="$REPO_ROOT/docs-build"
SEED="${SEED:-latest}"
KEEP_CACHE="${KEEP_CACHE:-0}"

[[ -d "$DOCS_BUILD" ]] || { echo "fatal: $DOCS_BUILD not found" >&2; exit 1; }

# Copy the gitignored, code-generated artifacts (OpenAPI spec + SDK/Embed.js
# typedoc) from the live ./docs into a version's content dir so the API page and
# include_file transclusions render. These are a function of code, not markdown,
# so the extracted snapshots never contain them; this reflects the *current*
# checkout — accurate for latest, approximate for older versions.
seed_generated() {
  local dir="$1" src="$REPO_ROOT/docs" p
  [[ -f "$src/api.json" ]] && cp -f "$src/api.json" "$dir/api.json"
  for p in embedding/sdk/api embedding/eajs/snippets; do
    if [[ -d "$src/$p" ]]; then
      mkdir -p "$dir/$p"
      rsync -a "$src/$p/" "$dir/$p/"
    fi
  done
}

# Build one version. Runs with `set -e` suspended (called from an `if`), so each
# critical step is guarded explicitly; returns non-zero on any failure.
build_one() {
  local label="$1" base="$2" tail="$3" content="$4"

  if [[ "$SEED" == "all" || ( "$SEED" == "latest" && "$label" == "latest" ) ]]; then
    echo "    seeding generated artifacts (api.json, SDK typedoc) from ./docs"
    seed_generated "$content" || { echo "    seed failed" >&2; return 1; }
  fi

  if [[ "$KEEP_CACHE" != "1" ]]; then
    rm -rf "$DOCS_BUILD/.astro" "$DOCS_BUILD/node_modules/.astro" "$DOCS_BUILD/dist"
  fi

  ( cd "$DOCS_BUILD" \
      && DOCS_CONTENT_DIR="$content" \
         DOCS_BASE_PATH="$base" \
         ${DOCS_SITE_URL:+DOCS_SITE_URL="$DOCS_SITE_URL"} \
         bun run build ) || return 1

  local dest="$SITE_DIR/$tail"
  mkdir -p "$dest" || return 1
  # Trailing slashes: contents of dist/ into dest/. --delete keeps reruns clean.
  rsync -a --delete "$DOCS_BUILD/dist/" "$dest/" || return 1

  # remark-version-images rewrote markdown images to absolute URLs and Astro no
  # longer emits them, so copy the actual image files (preserving structure)
  # from the content dir into the output. Runs after the --delete site sync.
  rsync -am \
    --include='*/' \
    --include='*.png'  --include='*.PNG'  --include='*.jpg' --include='*.jpeg' \
    --include='*.JPG'  --include='*.JPEG' --include='*.gif' --include='*.GIF' \
    --include='*.svg'  --include='*.webp' --include='*.avif' --include='*.ico' \
    --exclude='*' \
    "$content/" "$dest/" || return 1
}

# ---- discover versions (positional args override) ----
versions=()
if (($#)); then
  versions=("$@")
else
  shopt -s nullglob
  for d in "$BUILD_DIR"/*/; do
    name="$(basename "$d")"
    case "$name" in
      docs|.*) continue ;;            # skip the output dir and dot dirs (.stamps)
    esac
    versions+=("$name")
  done
  shopt -u nullglob
fi

if ((${#versions[@]} == 0)); then
  echo "No version dirs found under $BUILD_DIR. Run bin/build-versioned-docs.sh first." >&2
  exit 1
fi

# ---- ensure docs-build deps once ----
echo "Installing docs-build dependencies..."
if [[ -f "$DOCS_BUILD/bun.lock" || -f "$DOCS_BUILD/bun.lockb" ]]; then
  ( cd "$DOCS_BUILD" && bun install --frozen-lockfile )
else
  ( cd "$DOCS_BUILD" && bun install )
fi

echo "Rendering ${#versions[@]} version(s) -> $SITE_DIR (serial)"
SECONDS=0
built=(); failed=(); skipped=()

for label in "${versions[@]}"; do
  if [[ "$label" == "latest" ]]; then
    base="/docs/latest"; tail="latest"
  elif [[ "$label" =~ ^[0-9]+$ ]]; then
    base="/docs/v0.$label"; tail="v0.$label"
  else
    echo "  ~ $label (skipped: unrecognized version label)"
    skipped+=("$label"); continue
  fi
  content="$BUILD_DIR/$label"
  if [[ ! -d "$content" ]]; then
    echo "  ~ $label (skipped: $content not found)"
    skipped+=("$label"); continue
  fi

  echo
  echo "==> $label  →  $tail   (base $base)"
  if build_one "$label" "$base" "$tail" "$content"; then
    pages="$(find "$SITE_DIR/$tail" -name '*.html' | wc -l | tr -d ' ')"
    echo "    ✓ $tail  ($pages pages)"
    built+=("$tail")
  else
    echo "    ✗ $label build FAILED" >&2
    failed+=("$label")
  fi
done

echo
echo "Rendered ${#built[@]}/${#versions[@]} version(s) -> $SITE_DIR  (${SECONDS}s)"
((${#built[@]}))   && echo "  built:   ${built[*]}"
((${#skipped[@]})) && echo "  skipped: ${skipped[*]}"
if ((${#failed[@]})); then
  echo "  FAILED:  ${failed[*]}" >&2
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

SRC="/Users/tplude/code/ai-benchmark"
DEST="/Users/tplude/code/metabase/ai-benchmark"

if [ -d "$DEST" ]; then
  echo "Destination already exists: $DEST"
  echo "Remove it first or choose a different path."
  exit 1
fi

mkdir -p "$DEST"

# Root config files
cp "$SRC/pyproject.toml" "$DEST/"
cp "$SRC/poetry.lock" "$DEST/"
cp "$SRC/.config.toml" "$DEST/"
cp "$SRC/.gitattributes" "$DEST/"
cp "$SRC/.gitignore" "$DEST/"
cp "$SRC/CLAUDE.md" "$DEST/"
cp "$SRC/README.md" "$DEST/"

# Source code
cp -r "$SRC/src" "$DEST/"

# Docker
cp -r "$SRC/docker" "$DEST/"

# Scripts
cp -r "$SRC/scripts" "$DEST/"

# Notes / docs
cp -r "$SRC/notes" "$DEST/"

# Clean up Python artifacts
#find "$DEST" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
#find "$DEST" -name "*.pyc" -delete 2>/dev/null || true

# Set up LFS tracking in the metabase repo
cd "$DEST/.."
git lfs track "ai-benchmark/src/benchmarks/fixtures/db_dump.sql"

echo "Done. Copied ai-benchmark to $DEST"
echo ""
echo "Next steps:"
echo "  1. cd $DEST && poetry install"
echo "  2. Create or symlink .env in $DEST"

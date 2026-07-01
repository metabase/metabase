#!/usr/bin/env bash
# Build the v63 test image using the ee-extra Dockerfile: base = public EE image, with our
# H2-stripped fake-v63 jar copied over /app/metabase.jar.
set -euo pipefail
. "$(dirname "$0")/config.sh"

[ -f "$JAR_FINAL" ] || { echo "Missing $JAR_FINAL — run 01-build-jar.sh first"; exit 1; }

echo "== Assembling build context: $CTX_DIR =="
rm -rf "$CTX_DIR"; mkdir -p "$CTX_DIR"
cp "$EE_EXTRA_DIR/Dockerfile"     "$CTX_DIR/"
cp "$EE_EXTRA_DIR/entrypoint.sh"  "$CTX_DIR/"
cp -R "$EE_EXTRA_DIR/tracing"     "$CTX_DIR/tracing"
cp -R "$EE_EXTRA_DIR/logs"        "$CTX_DIR/logs"
cp "$JAR_FINAL"                   "$CTX_DIR/metabase.jar"

echo "== docker build (base EE_TAG=$EE_BASE_TAG) -> $V63_IMAGE =="
docker build --build-arg "EE_TAG=$EE_BASE_TAG" -t "$V63_IMAGE" "$CTX_DIR"
echo "Built $V63_IMAGE"

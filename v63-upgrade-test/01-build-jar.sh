#!/usr/bin/env bash
# Build the v63 test jar: download the $MB_REF branch's CI uberjar, re-stamp it as a v63 release, and
# remove H2 by running the REAL metabase-ee-extra packaging script ($REMOVE_H2_SCRIPT), which strips
# the H2 classes AND the dangling org.h2.Driver entry from META-INF/services/java.sql.Driver.
set -euo pipefail
. "$(dirname "$0")/config.sh"

[ -x "$REMOVE_H2_SCRIPT" ] || { echo "Missing/!executable $REMOVE_H2_SCRIPT (need the metabase-ee-extra branch checked out)"; exit 1; }
mkdir -p "$BUILD_DIR"

SRC_JAR="$(ls -t "$BUILD_DIR"/metabase_branch_${MB_REF}_*.jar 2>/dev/null | head -1 || true)"
if [ -n "$SRC_JAR" ] && [ -z "${FORCE_DOWNLOAD:-}" ]; then
  echo "== Reusing existing $MB_REF jar (skip download): $SRC_JAR =="
  echo "   (set FORCE_DOWNLOAD=1 to re-fetch the latest CI artifact)"
else
  : "${GH_TOKEN:?Set GH_TOKEN (mage jar-download needs it to pull the CI artifact)}"
  echo "== Downloading $MB_REF EE uberjar via mage =="
  ( cd "$METABASE_DIR" && ./bin/mage jar-download "$MB_REF" "$BUILD_DIR" )
  SRC_JAR="$(ls -t "$BUILD_DIR"/metabase_branch_${MB_REF}_*.jar | head -1)"
fi
echo "Source jar: $SRC_JAR"
cp "$SRC_JAR" "$JAR_FINAL"

echo "== Re-stamping version.properties tag=$FAKE_TAG (simulate a v63 release) =="
work="$(mktemp -d)"
( cd "$work" && jar xf "$JAR_FINAL" version.properties )
perl -0pi -e "s/^tag=.*/tag=$FAKE_TAG/m" "$work/version.properties"
( cd "$work" && jar uf "$JAR_FINAL" version.properties )
rm -rf "$work"

echo "== Removing H2 via the production ee-extra script: $REMOVE_H2_SCRIPT =="
"$REMOVE_H2_SCRIPT" "$JAR_FINAL"

echo "Final jar: $JAR_FINAL ($(du -h "$JAR_FINAL" | cut -f1)) tag=$(unzip -p "$JAR_FINAL" version.properties | grep '^tag=')"

#!/usr/bin/env bash
# Download the master EE uberjar, re-stamp it as the fake v63 release, and strip the H2
# library exactly as the ee-extra `update-build.yml` does for major_version >= 63.
set -euo pipefail
. "$(dirname "$0")/config.sh"

: "${GH_TOKEN:?Set GH_TOKEN (mage jar-download needs it to pull the CI artifact)}"

mkdir -p "$BUILD_DIR"

echo "== Downloading master EE uberjar via mage =="
( cd "$METABASE_DIR" && ./bin/mage jar-download master "$BUILD_DIR" )

SRC_JAR="$(ls -t "$BUILD_DIR"/metabase_branch_master_*.jar | head -1)"
echo "Source jar: $SRC_JAR"
cp "$SRC_JAR" "$JAR_FINAL"

echo "== Re-stamping version.properties tag=$FAKE_TAG =="
work="$(mktemp -d)"
( cd "$work" && jar xf "$JAR_FINAL" version.properties )
echo "-- before --"; cat "$work/version.properties"
perl -0pi -e "s/^tag=.*/tag=$FAKE_TAG/m" "$work/version.properties"
echo "-- after --"; cat "$work/version.properties"
( cd "$work" && jar uf "$JAR_FINAL" version.properties )
rm -rf "$work"

major="$(printf '%s' "$FAKE_TAG" | cut -d'.' -f2)"
echo "Parsed major_version = $major (H2 removal fires when >= 63)"

echo "== Stripping org/h2/* from the uberjar =="
zip -q -d "$JAR_FINAL" 'org/h2/*' || true

echo "== Asserting H2 classes are gone =="
h2count="$(unzip -l "$JAR_FINAL" | grep -c 'org/h2/' || true)"
if [ "$h2count" -ne 0 ]; then
  echo "FAIL: $h2count org/h2/ entries still present in the jar"; exit 1
fi
echo "OK: no org/h2/ entries remain"
echo "Final jar: $JAR_FINAL ($(du -h "$JAR_FINAL" | cut -f1))"
echo "tag: $(unzip -p "$JAR_FINAL" version.properties | grep '^tag=')"

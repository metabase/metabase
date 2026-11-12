#!/bin/sh
# Prepares /app files for static-viz in the Alpine image, see bin/docker/js-isolate/README.md.
# Usage: prepare-static-viz.sh METABASE_JAR OUT_DIR, with the JS isolate already in OUT_DIR/js-isolate.
set -eu

jar=$1
out=$2

# the isolate must match the GraalVM version in metabase.jar
jar_version=$(unzip -p "$jar" META-INF/graalvm/org.graalvm.truffle/version || true)
isolate_version=$(cat "$out/js-isolate/VERSION")
if [ -z "$jar_version" ] || [ "$jar_version" != "$isolate_version" ]; then
  echo "metabase.jar uses Truffle '${jar_version:-<unknown>}' but the JS isolate was built for '$isolate_version'; rebuild it (bin/docker/js-isolate)" >&2
  exit 1
fi

# pre-extract libtruffleattach so isolates work without a writable $HOME
case "$(uname -m)" in
  x86_64) arch=amd64 ;;
  aarch64) arch=aarch64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
mkdir -p "$out/truffle-attach/bin"
unzip -q -j "$jar" "META-INF/resources/engine/libtruffleattach/linux/$arch/bin/libtruffleattach.so" -d "$out/truffle-attach/bin"
test -s "$out/truffle-attach/bin/libtruffleattach.so"
echo "$jar_version" > "$out/truffle-attach/VERSION"

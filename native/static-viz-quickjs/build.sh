#!/usr/bin/env bash
# Builds libstaticviz (the QuickJS static-viz library) for the current platform
# and installs it under resources/static-viz-quickjs/<os>-<arch>/, where the
# backend loads it from the classpath via JNA.
#
# QuickJS-ng is fetched at a pinned tag and linked statically, so the produced
# library has no runtime dependencies beyond libc (and libm/libpthread on Linux).
#
# Usage: ./build.sh [--output <path>]

set -euo pipefail

QUICKJS_NG_VERSION="v0.15.1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

case "$(uname -s)" in
  Darwin) OS="macos"; LIB_NAME="libstaticviz.dylib"; SHARED_FLAGS="-dynamiclib" ;;
  Linux) OS="linux"; LIB_NAME="libstaticviz.so"; SHARED_FLAGS="-shared" ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="amd64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

OUTPUT="$REPO_ROOT/resources/static-viz-quickjs/$OS-$ARCH/$LIB_NAME"
if [[ "${1:-}" == "--output" ]]; then
  OUTPUT="$2"
fi

mkdir -p "$BUILD_DIR"

if [[ ! -d "$BUILD_DIR/quickjs-ng" ]]; then
  git clone --depth 1 --branch "$QUICKJS_NG_VERSION" \
    https://github.com/quickjs-ng/quickjs.git "$BUILD_DIR/quickjs-ng"
fi

cmake -S "$BUILD_DIR/quickjs-ng" -B "$BUILD_DIR/quickjs-ng/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DQJS_BUILD_EXAMPLES=OFF \
  -DQJS_BUILD_CLI_WITH_MIMALLOC=OFF \
  >/dev/null
cmake --build "$BUILD_DIR/quickjs-ng/build" --target qjs --parallel >/dev/null

mkdir -p "$(dirname "$OUTPUT")"
cc -O2 -fPIC $SHARED_FLAGS -fvisibility=hidden -o "$OUTPUT" "$SCRIPT_DIR/staticviz.c" \
  -I"$BUILD_DIR/quickjs-ng" \
  "$BUILD_DIR/quickjs-ng/build/libqjs.a" \
  -lm -lpthread

cc -O2 -o "$BUILD_DIR/smoke-test" "$SCRIPT_DIR/smoke_test.c" \
  -I"$BUILD_DIR/quickjs-ng" -ldl
"$BUILD_DIR/smoke-test" "$OUTPUT"

echo "built $OUTPUT"

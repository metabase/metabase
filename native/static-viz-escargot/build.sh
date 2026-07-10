#!/usr/bin/env bash
# Builds libstaticviz (the Escargot static-viz library) for the current
# platform and installs it under resources/static-viz-escargot/<os>-<arch>/,
# where the backend loads it from the classpath via JNA.
#
# Escargot is fetched at a pinned commit and linked statically. ICU (which
# backs the engine's native Intl) comes from the system: on Linux the engine
# uses its bundled runtime binder to dlopen the distribution's libicu at
# runtime — nothing ICU-related is needed at build time; on macOS it links
# against Homebrew's icu4c.
#
# Usage: ./build.sh [--output <path>]

set -euo pipefail

ESCARGOT_COMMIT="6421e702bff3b320c828450bcf0dfcaa841422d2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
ESCARGOT_DIR="$BUILD_DIR/escargot"
ESCARGOT_OUT="$ESCARGOT_DIR/out-lib"

case "$(uname -s)" in
  Darwin)
    OS="macos"
    LIB_NAME="libstaticviz.dylib"
    SHARED_FLAG="-dynamiclib"
    ICU_CMAKE_FLAGS=(-DESCARGOT_LIBICU_SUPPORT_WITH_DLOPEN=OFF)
    ICU_PREFIX="$(brew --prefix icu4c)"
    export PKG_CONFIG_PATH="$ICU_PREFIX/lib/pkgconfig"
    ICU_LINK_FLAGS=(-L"$ICU_PREFIX/lib" -licuuc -licui18n -licudata)
    ;;
  Linux)
    OS="linux"
    LIB_NAME="libstaticviz.so"
    SHARED_FLAG="-shared"
    ICU_CMAKE_FLAGS=(-DESCARGOT_LIBICU_SUPPORT_WITH_DLOPEN=ON)
    ICU_LINK_FLAGS=(-ldl)
    ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="amd64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

OUTPUT="$REPO_ROOT/resources/static-viz-escargot/$OS-$ARCH/$LIB_NAME"
if [[ "${1:-}" == "--output" ]]; then
  OUTPUT="$2"
fi

mkdir -p "$BUILD_DIR"

if [[ ! -d "$ESCARGOT_DIR" ]]; then
  git clone https://github.com/Samsung/escargot.git "$ESCARGOT_DIR"
fi
git -C "$ESCARGOT_DIR" fetch -q origin "$ESCARGOT_COMMIT"
git -C "$ESCARGOT_DIR" checkout -q "$ESCARGOT_COMMIT"
git -C "$ESCARGOT_DIR" submodule update --init --depth 1 \
  third_party/GCutil third_party/runtime_icu_binder third_party/walrus

cmake -S "$ESCARGOT_DIR" -B "$ESCARGOT_OUT" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DESCARGOT_OUTPUT=static_lib \
  -DESCARGOT_THREADING=ON \
  -DESCARGOT_CODE_CACHE=OFF \
  "${ICU_CMAKE_FLAGS[@]}" \
  >/dev/null
ninja -C "$ESCARGOT_OUT" escargot >/dev/null

mkdir -p "$(dirname "$OUTPUT")"
c++ -O2 -std=c++17 -fPIC "$SHARED_FLAG" -fvisibility=hidden -o "$OUTPUT" \
  "$SCRIPT_DIR/staticviz.cpp" \
  -I"$ESCARGOT_DIR/src/api" -I"$ESCARGOT_DIR/third_party/GCutil" \
  "$ESCARGOT_OUT/libescargot.a" \
  "$ESCARGOT_OUT/third_party/GCutil/libgc-lib.a" \
  "$ESCARGOT_OUT/liblibbf.a" \
  "$ESCARGOT_OUT/liblibsimdutf.a" \
  "${ICU_LINK_FLAGS[@]}" \
  -lpthread

cc -O2 -o "$BUILD_DIR/smoke-test" "$SCRIPT_DIR/smoke_test.c" -ldl
"$BUILD_DIR/smoke-test" "$OUTPUT"

echo "built $OUTPUT"

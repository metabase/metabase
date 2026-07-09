#!/usr/bin/env bash
# Builds libstaticviz (the QuickJS static-viz library) and installs it under
# resources/static-viz-quickjs/<os>-<arch>/, where the backend loads it from
# the classpath via JNA.
#
# QuickJS-ng is fetched at a pinned tag and compiled in directly (four C
# files), so the produced library depends only on libc/libm/libpthread.
# Linux builds target glibc 2.17, old enough for any non-EOL distribution.
#
# Usage:
#   ./build.sh                  build for the current platform (host cc)
#   ./build.sh --all            cross-compile every supported platform, so a
#                               locally built jar works everywhere
#                               (macOS host; Linux targets need `zig`)
#   ./build.sh --output <path>  build for the current platform to <path>
#
# The smoke test executes against the host-platform library; cross-compiled
# targets are built here but execution-tested on native runners in CI.

set -euo pipefail

QUICKJS_NG_VERSION="v0.15.1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
QJS_DIR="$BUILD_DIR/quickjs-ng"
RESOURCES_DIR="$REPO_ROOT/resources/static-viz-quickjs"

QJS_SOURCES=("$QJS_DIR/dtoa.c" "$QJS_DIR/libregexp.c" "$QJS_DIR/libunicode.c" "$QJS_DIR/quickjs.c")
CFLAGS=(-O2 -fPIC -fvisibility=hidden -D_GNU_SOURCE -DNDEBUG "-I$QJS_DIR")

case "$(uname -s)" in
  Darwin) HOST_OS="macos" ;;
  Linux) HOST_OS="linux" ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) HOST_ARCH="arm64" ;;
  x86_64 | amd64) HOST_ARCH="amd64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac
HOST_PLATFORM="$HOST_OS-$HOST_ARCH"
HOST_LIB_NAME="libstaticviz.so"
HOST_SHARED_FLAG="-shared"
if [[ "$HOST_OS" == macos ]]; then
  HOST_LIB_NAME="libstaticviz.dylib"
  HOST_SHARED_FLAG="-dynamiclib"
fi

# build_lib <output> <compiler and target/shared flags...>
build_lib() {
  local output="$1"
  shift
  mkdir -p "$(dirname "$output")"
  "$@" "${CFLAGS[@]}" -o "$output" "$SCRIPT_DIR/staticviz.c" "${QJS_SOURCES[@]}" -lm -lpthread
  echo "built $output"
}

smoke_test() {
  cc -O2 -o "$BUILD_DIR/smoke-test" "$SCRIPT_DIR/smoke_test.c" -ldl
  "$BUILD_DIR/smoke-test" "$1"
}

mkdir -p "$BUILD_DIR"
if [[ ! -d "$QJS_DIR" ]]; then
  git clone --depth 1 --branch "$QUICKJS_NG_VERSION" \
    https://github.com/quickjs-ng/quickjs.git "$QJS_DIR"
fi

case "${1:-}" in
  --all)
    if [[ "$HOST_OS" != macos ]]; then
      echo "--all currently supports a macOS host" >&2
      exit 1
    fi
    command -v zig >/dev/null || { echo "--all needs zig for the Linux targets (brew install zig)" >&2; exit 1; }
    build_lib "$RESOURCES_DIR/macos-arm64/libstaticviz.dylib" cc -arch arm64 -dynamiclib
    build_lib "$RESOURCES_DIR/macos-amd64/libstaticviz.dylib" cc -arch x86_64 -dynamiclib
    build_lib "$RESOURCES_DIR/linux-amd64/libstaticviz.so" zig cc -target x86_64-linux-gnu.2.17 -shared -Wl,-s
    build_lib "$RESOURCES_DIR/linux-arm64/libstaticviz.so" zig cc -target aarch64-linux-gnu.2.17 -shared -Wl,-s
    smoke_test "$RESOURCES_DIR/$HOST_PLATFORM/$HOST_LIB_NAME"
    ;;
  --output)
    build_lib "$2" cc "$HOST_SHARED_FLAG"
    smoke_test "$2"
    ;;
  *)
    build_lib "$RESOURCES_DIR/$HOST_PLATFORM/$HOST_LIB_NAME" cc "$HOST_SHARED_FLAG"
    smoke_test "$RESOURCES_DIR/$HOST_PLATFORM/$HOST_LIB_NAME"
    ;;
esac

#!/usr/bin/env bash
# Build SQLite 3.50.3 with the RERANK BASED ON VIBES grammar (patches/), as
#   out/sqlite3-vibes                           a sqlite3 shell, for trying it out
#   out/fakevibes.dylib                         a deterministic vibes() for the shell (.load out/fakevibes)
#   out/<os>-<arch>/libsqlitejdbc.dylib         a drop-in native library for sqlite-jdbc 3.50.3.0
#
# Usage: ./build.sh [--test]     (--test also builds SQLite's testfixture and runs test/vibesrerank.test)
#
# Needs: curl, unzip, git, make, cc, a JDK (javac) and, for --test, tclsh 9 (brew install tcl-tk).
set -euo pipefail

cd "$(dirname "$0")"
HERE="$PWD"
SQLITE_VERSION=3500300
SQLITE_ZIP="sqlite-src-${SQLITE_VERSION}.zip"
SQLITE_URL="https://sqlite.org/2025/${SQLITE_ZIP}"
SQLITE_SHA256=119862654b36e252ac5f8add2b3d41ba03f4f387b48eb024956c36ea91012d3f
JDBC_TAG=3.50.3.0

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  OS_NAME=Mac; OS_ARCH=aarch64; LIB=libsqlitejdbc.dylib; OUT_DIR=darwin-aarch64 ;;
  Darwin-x86_64) OS_NAME=Mac; OS_ARCH=x86_64;  LIB=libsqlitejdbc.dylib; OUT_DIR=darwin-x86_64 ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m) (darwin only)" >&2; exit 1 ;;
esac

BUILD="$HERE/build"
SRC="$BUILD/sqlite-src-${SQLITE_VERSION}"
mkdir -p "$BUILD" "$HERE/out/$OUT_DIR"

# 1. pinned source tree, patched
if [ ! -f "$BUILD/$SQLITE_ZIP" ]; then
  curl -sSfL -o "$BUILD/$SQLITE_ZIP" "$SQLITE_URL"
fi
echo "$SQLITE_SHA256  $BUILD/$SQLITE_ZIP" | shasum -a 256 -c -
rm -rf "$SRC"
unzip -q "$BUILD/$SQLITE_ZIP" -d "$BUILD"
(cd "$SRC" && patch -p1 --quiet < "$HERE/patches/0001-rerank-based-on-vibes.patch")
cp "$HERE/test/vibesrerank.test" "$SRC/test/"

# 2. amalgamation (regenerates parse.c, keywordhash.h, ctime.c)
rm -rf "$BUILD/bld" && mkdir -p "$BUILD/bld"
(cd "$BUILD/bld" && "$SRC/configure" --disable-tcl > configure.log && make sqlite3.c shell.c > make.log)
mkdir -p "$BUILD/amal"
cp "$BUILD/bld/sqlite3.c" "$BUILD/bld/sqlite3.h" "$BUILD/bld/sqlite3ext.h" "$BUILD/amal/"

# 3. shell and the fake vibes() extension
cc -O2 -DSQLITE_ENABLE_LOAD_EXTENSION -DSQLITE_THREADSAFE=1 -DSQLITE_ENABLE_MATH_FUNCTIONS \
   -I"$BUILD/amal" "$BUILD/bld/shell.c" "$BUILD/amal/sqlite3.c" -o "$HERE/out/sqlite3-vibes"
cc -O2 -dynamiclib -I"$BUILD/amal" "$HERE/test/fakevibes.c" -o "$HERE/out/fakevibes.dylib"

# 4. sqlite-jdbc's native library, built the way xerial builds its release (same flags), from our amalgamation
if [ ! -d "$BUILD/sqlite-jdbc" ]; then
  git clone -q --depth 1 --branch "$JDBC_TAG" https://github.com/xerial/sqlite-jdbc.git "$BUILD/sqlite-jdbc"
fi
JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}"
(cd "$BUILD/sqlite-jdbc" && rm -rf target/sqlite-*-"$OS_NAME"-"$OS_ARCH" && \
   JAVA_HOME="$JAVA_HOME" make native SQLITE_SOURCE="$BUILD/amal" OS_NAME="$OS_NAME" OS_ARCH="$OS_ARCH" > "$BUILD/jdbc-make.log")
cp "$BUILD/sqlite-jdbc/target/sqlite-3.50.3-$OS_NAME-$OS_ARCH/$LIB" "$HERE/out/$OUT_DIR/$LIB"
# Unsigned, locally built: make sure Gatekeeper doesn't refuse it.
xattr -d com.apple.quarantine "$HERE/out/$OUT_DIR/$LIB" 2>/dev/null || true
codesign -s - -f "$HERE/out/$OUT_DIR/$LIB" 2>/dev/null || true

echo "built:"
echo "  $HERE/out/sqlite3-vibes"
echo "  $HERE/out/$OUT_DIR/$LIB"
echo "JVM flags: -Dorg.sqlite.lib.path=$HERE/out/$OUT_DIR -Dorg.sqlite.lib.name=$LIB"

# 5. optional: SQLite's own test harness
if [ "${1:-}" = "--test" ]; then
  "$HERE/test/run-engine-tests.sh"
fi

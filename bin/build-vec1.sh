#! /usr/bin/env bash

# Build the vec1 SQLite vector extension binaries that ship in resources/vec1/.
#
# vec1 (https://sqlite.org/vec1) is a single public-domain C file. Upstream publishes no prebuilt
# binaries and no Maven artifact, so we compile it ourselves for every platform Metabase runs on.
# The Linux builds run in Docker so the results do not depend on the host toolchain.
# Sources are downloaded and checksum-verified by bin/fetch-vec1.sh, which this script runs first.
#
# Usage:
#   ./bin/build-vec1.sh                                  # every target this host can build
#   ./bin/build-vec1.sh linux-x86_64-musl darwin-aarch64 # just these
#
# Targets:
#   linux-x86_64-musl    Alpine, the default Docker image
#   linux-aarch64-musl
#   linux-x86_64-glibc   Debian, for bin/docker/Dockerfile_ubuntu and bare-jar installs
#   linux-aarch64-glibc
#   darwin-aarch64       built natively; needs Xcode command line tools
#   darwin-x86_64        cross-compiled from any Mac via -arch
#
# windows-x86_64 needs MSVC and is not built here:
#   cl /Zi /O2 /DNDEBUG /arch:AVX2 vec1.c -link -dll -out:vec1.dll

set -eo pipefail

script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

source_dir="native/vec1"
source_file="$source_dir/vec1.c"
output_dir="resources/vec1"

all_targets="linux-x86_64-musl linux-aarch64-musl linux-x86_64-glibc linux-aarch64-glibc darwin-aarch64 darwin-x86_64"

# gcc on aarch64 rejects vec1's NEON intrinsics over uint32x4_t/int32x4_t signedness; clang accepts
# them. -flax-vector-conversions makes both compilers happy and is a no-op on x86-64.
common_cflags="-O3 -DNDEBUG -flax-vector-conversions -fPIC"

# Docker builds run with $source_dir as the working directory; the Darwin build adds its own -I.
docker_cflags="-I. $common_cflags"

# vec1 compiled for x86-64 with AVX2 will not run on hardware that lacks it. Upstream's "vec1multi"
# recipe compiles the file twice and links both objects together, dispatching at runtime.
compile_script() {
    local arch="$1"
    if [ "$arch" = "x86_64" ]; then
        echo "
        cc -DVEC1SIMD=SCALAR -c $docker_cflags vec1.c -o scalar.o
        cc -DVEC1SIMD=AVX2 -mavx2 -mfma -c $docker_cflags vec1.c -o avx2.o
        cc scalar.o avx2.o -shared -fPIC -lm -o build-output
        rm -f scalar.o avx2.o"
    else
        echo "cc $docker_cflags -shared vec1.c -lm -o build-output"
    fi
}

build_linux() {
    local target="$1" platform="$2" image="$3" install="$4" arch="$5"

    echo "Building $target"
    docker run --rm --platform "$platform" \
           -v "$PWD/$source_dir:/vec1" -w /vec1 "$image" \
           sh -c "set -e; $install >/dev/null; `compile_script "$arch"`"

    mkdir -p "$output_dir/$target"
    mv "$source_dir/build-output" "$output_dir/$target/vec1.so"
}

build_darwin() {
    local target="$1" arch="$2"

    if ! cc --version >/dev/null 2>&1; then
        echo "Skipping $target: no working C compiler (run 'sudo xcodebuild -license')" >&2
        return
    fi

    echo "Building $target"
    mkdir -p "$output_dir/$target"
    if [ "$arch" = "x86_64" ]; then
        cc -arch x86_64 -DVEC1SIMD=SCALAR -c -I"$source_dir" $common_cflags "$source_file" -o /tmp/vec1-scalar.o
        cc -arch x86_64 -DVEC1SIMD=AVX2 -mavx2 -mfma -c -I"$source_dir" $common_cflags "$source_file" -o /tmp/vec1-avx2.o
        cc -arch x86_64 /tmp/vec1-scalar.o /tmp/vec1-avx2.o -shared -lm -o "$output_dir/$target/vec1.dylib"
        rm -f /tmp/vec1-scalar.o /tmp/vec1-avx2.o
    else
        cc -arch arm64 -I"$source_dir" $common_cflags -shared "$source_file" -lm -o "$output_dir/$target/vec1.dylib"
    fi
}

alpine_install="apk add -q --no-cache build-base"
debian_install="apt-get -qq update && apt-get -qq install -y gcc libc6-dev"

build_target() {
    case "$1" in
        linux-x86_64-musl)   build_linux "$1" linux/amd64 alpine:3  "$alpine_install" x86_64 ;;
        linux-aarch64-musl)  build_linux "$1" linux/arm64 alpine:3  "$alpine_install" aarch64 ;;
        linux-x86_64-glibc)  build_linux "$1" linux/amd64 debian:12 "$debian_install" x86_64 ;;
        linux-aarch64-glibc) build_linux "$1" linux/arm64 debian:12 "$debian_install" aarch64 ;;
        darwin-aarch64)      build_darwin "$1" aarch64 ;;
        darwin-x86_64)       build_darwin "$1" x86_64 ;;
        *) echo "Unknown target: $1" >&2; exit 1 ;;
    esac
}

targets="$@"
if [ -z "$targets" ]; then
    targets="$all_targets"
    if [ "`uname -s`" != "Darwin" ]; then
        targets="linux-x86_64-musl linux-aarch64-musl linux-x86_64-glibc linux-aarch64-glibc"
    fi
fi

"$script_directory/fetch-vec1.sh"

for target in $targets; do
    build_target "$target"
done

echo
echo "vec1 binaries in $output_dir:"
ls -la "$output_dir"/*/vec1.* 2>/dev/null || true

#! /usr/bin/env bash

# Download the pinned vec1 sources into native/vec1/, verifying checksums.
#
# vec1 (https://sqlite.org/vec1) is the SQLite project's vector search extension: a single
# public-domain C file, with no prebuilt binaries and no Maven artifact. bin/build-vec1.sh compiles it
# into the platform binaries under resources/vec1/ and calls this script first.
#
# Files are only downloaded when missing, but checksums are verified on every run.

set -eo pipefail

script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

# Pinned to the version-0.7 release. Bump version and checksum together.
vec1_version="0.7"
vec1_sha256="8571bb4f77f9547d11ad11e2f72e0de7d3b2ab44e7930151998bce9377ed4b86"
vec1_url="https://sqlite.org/vec1/raw/vec1.c?ci=version-${vec1_version}"

# vec1 is compiled against pinned SQLite headers rather than each distro's, for two reasons: distro
# headers vary in age, and an older sqlite3.h silently truncates vec1's sqlite3_module while vec1 still
# declares the newer iVersion -- SQLite then reads past the end of the struct at runtime. Debian 12
# (SQLite 3.40, no xIntegrity) hits exactly this. Keep this version matching the SQLite bundled in the
# org.xerial/sqlite-jdbc pinned in deps.edn.
sqlite_version="3500300"
sqlite_year="2025"
sqlite_sha256="9ad6d16cbc1df7cd55c8b55127c82a9bca5e9f287818de6dc87e04e73599d754"
sqlite_url="https://sqlite.org/${sqlite_year}/sqlite-amalgamation-${sqlite_version}.zip"

source_dir="native/vec1"

verify_sha256() {
    local file="$1" expected="$2"
    local actual=`shasum -a 256 "$file" | cut -d' ' -f1`
    if [ "$actual" != "$expected" ]; then
        echo "sha256 mismatch for $file: expected $expected, got $actual" >&2
        exit 1
    fi
}

mkdir -p "$source_dir"

if [ ! -f "$source_dir/vec1.c" ]; then
    echo "Downloading vec1 $vec1_version"
    curl -sfL "$vec1_url" -o "$source_dir/vec1.c"
fi
verify_sha256 "$source_dir/vec1.c" "$vec1_sha256"

if [ ! -f "$source_dir/sqlite3.h" ] || [ ! -f "$source_dir/sqlite3ext.h" ]; then
    echo "Downloading SQLite $sqlite_version headers"
    zip_file="`mktemp -t sqlite-amalgamation`"
    curl -sfL "$sqlite_url" -o "$zip_file"
    verify_sha256 "$zip_file" "$sqlite_sha256"
    unzip -qo -j "$zip_file" \
          "sqlite-amalgamation-$sqlite_version/sqlite3.h" \
          "sqlite-amalgamation-$sqlite_version/sqlite3ext.h" \
          -d "$source_dir"
    rm -f "$zip_file"
fi

echo "vec1 $vec1_version sources ready in $source_dir"

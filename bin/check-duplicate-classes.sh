#! /usr/bin/env bash

set -eu

if [ ! "$2" ]; then
    echo "Check for duplicate classes in two JARs."
    echo "Usage: ./bin/check-duplicate-classes.sh jar1.jar jar2.jar"
    exit -1
fi

list-files() {
    jar -tf "$1" | grep -E 'class$|clj$'
}

duplicates=`{ list-files "$1"; list-files "$2"; } | sort | uniq -d`

if [ "$duplicates" ]; then
    echo "Duplicate files found:"
    for file in "$duplicates"; do
        printf "$file\n"
    done
    exit -1
else
    echo "No duplicate files found in $1 and $2. Good work."
fi

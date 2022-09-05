#! /usr/bin/env bash

set -euo pipefail

script_directory=`dirname "${BASH_SOURCE[0]}"`

# This function will clear all the .cpcache directories if any deps.edn file is newer than any of them.
clear_outdated_cpcaches() {
    echo "Clearing outdated .cpcache directories if needed..."

    # switch to project root directory if we're not already there
    cd "$script_directory/.."
    project_root=`pwd`

    cpcaches=`find bin modules -type d -name .cpcache`
    if [ -d .cpcache ]; then
        cpcaches=".cpcache $cpcaches"
    fi
    if [ -z "$cpcaches" ]; then
        echo "No .cpcache directories found; nothing to do"
        return 0
    fi

    deps_edns="deps.edn $(find bin modules -type f -name deps.edn)"

    # find the OLDEST cpcache and NEWEST deps.edn files.
    oldest_cpcache=""
    for cpcache in $cpcaches; do
        if [ -z "$oldest_cpcache" ] || [ "$cpcache" -ot "$oldest_cpcache" ]; then
            oldest_cpcache="$cpcache"
        fi
    done

    newest_deps_edn=""
    for deps_edn in $deps_edns; do
        if [ -z "$newest_deps_edn" ] || [ "$deps_edn" -nt "$newest_deps_edn" ]; then
            newest_deps_edn="$deps_edn"
        fi
    done

    # if the newest deps.edn is newer than the *ANY* of the cpcaches, clear all the cpcaches.
    if [ "$newest_deps_edn" -nt "$oldest_cpcache" ]; then
        echo "$newest_deps_edn is newer than $oldest_cpcache; deleting all .cpcache directories"
        for cpcache in $cpcaches; do
            echo "rm -rf $cpcache"
            rm -rf "$cpcache"
        done
    else
        echo ".cpcache directories are up to date."
    fi
}

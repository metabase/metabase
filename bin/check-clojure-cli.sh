#! /usr/bin/env bash

set -eou pipefail

you_need_to_upgrade() {
    echo "Clojure CLI must be at least version 1.10.1.708. Your version is $version."
    echo "See https://www.clojure.org/guides/getting_started for upgrade instructions."
    exit -3
}

check_clojure_cli() {
    if [ ! `which clojure` ]; then
        echo "Please install the Clojure command line tools. See https://www.clojure.org/guides/getting_started for instructions."
        exit -2
    fi

    version=`clojure --help | grep Version`
    minor_version=`echo "$version" | cut -d '.' -f 2`
    patch_version=`echo "$version" | cut -d '.' -f 3`
    build_version=`echo "$version" | cut -d '.' -f 4`

    if [ "$minor_version" -lt "10" ]; then
        you_need_to_upgrade
    elif [ "$minor_version" -eq "10" ]; then
        if [ "$patch_version" -lt "1" ]; then
            you_need_to_upgrade
        elif [ "$patch_version" -eq "1" ]; then
            if [ "$build_version" -lt "708" ]; then
                you_need_to_upgrade
            fi
        fi
    fi
}

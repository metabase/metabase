#! /usr/bin/env bash

set -eo pipefail

# If ran as `./bin/build-drivers.sh clean` then uninstall metabase-core from the local Maven repo and delete
if [ "$1" == clean ]; then
    echo "Deleting existing installed metabase-core and driver dependencies..."
    rm -rf ~/.m2/repository/metabase-core
    rm -rf ~/.m2/repository/metabase/*-driver

    echo "Deleting built drivers in resources/modules..."
    rm -rf resources/modules
    echo "Deleting build Metabase uberjar..."
    rm -rf target

    for target in `find modules -name 'target' -type d`; do
        echo "Deleting $target..."
        rm -rf "$target"
    done
fi

# strip trailing slashes if `ls` is set to include them
drivers=`ls modules/drivers/ | sed 's|/$||'`

for driver in $drivers; do
    echo "Build: $driver"

    build_failed=''
    ./bin/build-driver.sh "$driver" || build_failed=true

    if [ "$build_failed" ]; then
        echo "Failed to build driver $driver."
        exit -1
    fi
done

# Double-check that all drivers were built successfully
for driver in $drivers; do
    verification_failed=''
    ./bin/verify-driver "$driver" || verification_failed=true

    if [ "$verification_failed" ]; then
        exit -2
    fi
done

#! /usr/bin/env bash

set -eu

project_root=`pwd`

driver="$1"
driver_jar="$driver.metabase-driver.jar"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh [driver]"
    exit -1
fi

mkdir -p resources/modules

echo "Deleting existing $driver drivers..."
rm -f resources/modules/"$driver_jar"
rm -f plugins/"$driver_jar"

mb_jar=`find ~/.m2/repository/metabase-core/metabase-core/ -name '*.jar'`

if [ ! "$mb_jar" ]; then
    echo "Building Metabase and installing locally..."
    lein clean
    lein install-for-building-drivers
fi

driver_project_dir="$project_root/modules/drivers/$driver"

# echo "Checking if $driver has duplicate dependencies with the core Metabase project..."
# lein run find-duplicate-deps "$driver_project_dir"

echo "Building $driver driver..."

cd "$driver_project_dir"

rm -rf target

lein clean
LEIN_SNAPSHOTS_IN_RELEASE=true lein uberjar

cd "$project_root"

target_jar="$driver_project_dir/target/uberjar/$driver_jar"

if [ ! -f "$target_jar" ]; then
    echo "Error: could not find $target_jar. Build failed."
    exit -1
fi

METABASE_UBERJAR=target/uberjar/metabase.jar

if [ ! -f $METABASE_UBERJAR ]; then
    echo 'Building Metabase uberjar...'
    lein uberjar
fi

lein strip-and-compress "$target_jar"

# TODO - this step is actually uneccesary now that we have the strip-and-compress command above
echo "Checking if driver Contains duplicate classes..."
./bin/check-duplicate-classes.sh "$target_jar" $METABASE_UBERJAR

dest_location="$project_root/resources/modules/$driver_jar"

echo "Copying $target_jar -> $dest_location"
cp "$target_jar" "$dest_location"

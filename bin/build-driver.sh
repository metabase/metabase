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

echo "Building $driver driver..."

driver_source_dir="$project_root/modules/drivers/$driver"

cd "$driver_source_dir"

lein clean
lein uberjar

cd "$project_root"

target_jar="$driver_source_dir/target/uberjar/$driver_jar"

if [ ! -f "$target_jar" ]; then
    echo "Error: could not find $target_jar. Build failed."
    exit -1
fi

if [ `jar -tf $target_jar | grep metabase/src/api` ]; then
    echo "Error: driver JAR contains metabase-core files. Build failed."
    exit -1
fi

dest_location="$project_root/resources/modules/$driver_jar"

echo "Copying $target_jar -> $dest_location"
cp "$target_jar" "$dest_location"

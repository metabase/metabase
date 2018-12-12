#! /usr/bin/env bash

set -eu

project_root=`pwd`

driver="$1"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh [driver]"
    exit -1
fi

# First, remove any existing drivers
driver_jar="$driver.metabase-driver.jar"

if [ -f resources/modules/"$driver.metabase-driver.jar" ]; then
    echo "$driver is already built."
    echo "To rebuild the driver, delete resources/modules/$driver.metabase-driver.jar and run this script again."
    exit 0
fi

mkdir -p resources/modules

echo "Deleting old versions of $driver driver..."
rm -f plugins/"$driver_jar"

driver_project_dir="$project_root/modules/drivers/$driver"

# Check if Metabase is installed locally for building drivers; install it if not
if [ ! `find ~/.m2/repository/metabase-core/metabase-core -name '*.jar'` ]; then
    echo "Building Metabase and installing locally..."
    lein clean
    lein install-for-building-drivers
fi

# Build Metabase uberjar if needed, we'll need this for stripping duplicate classes
metabase_uberjar="$project_root/target/uberjar/metabase.jar"

if [ ! -f "$metabase_uberjar" ]; then
    echo 'Building Metabase uberjar...'
    lein uberjar
fi

# Take a look at the `parents` file listing the parents to build, if applicable
parents_list="$driver_project_dir"/parents
parents=''

if [ -f "$parents_list" ]; then
    parents=`cat "$parents_list"`
    echo "Found driver parents: $parents"
fi

# Check and see if we need to recursively build or install any of our parents before proceeding
for parent in $parents; do
    if [ ! -f resources/modules/"$parent.metabase-driver.jar" ]; then
        echo "Building $parent..."
        ./bin/build-driver.sh "$parent"
    fi

    if [ ! `find "~/.m2/repository/metabase/$parent-driver/" -name '*.jar'` ]; then
        parent_project_dir="$project_root/modules/drivers/$parent"
        echo "Installing $parent locally..."
        cd "$parent_project_dir"
        lein clean
        lein install-for-building-drivers
        cd "$project_root"
    fi
done

# ok, now we can build the driver! wow
echo "Building $driver driver..."

cd "$driver_project_dir"

rm -rf target

lein clean
DEBUG=1 LEIN_SNAPSHOTS_IN_RELEASE=true lein uberjar

cd "$project_root"

target_jar="$driver_project_dir/target/uberjar/$driver_jar"

if [ ! -f "$target_jar" ]; then
    echo "Error: could not find $target_jar. Build failed."
    exit -1
fi

# ok, first things first, strip out any classes also found in the core Metabase uberjar
lein strip-and-compress "$target_jar"

# next, remove any classes also found in any of the parent JARs
for parent in $parents; do
    echo "Removing duplicate classes with $parent uberjar..."
    lein strip-and-compress "$target_jar" "resources/modules/$parent.metabase-driver.jar"
done

# ok, finally, copy finished JAR to the resources dir
dest_location="$project_root/resources/modules/$driver_jar"

echo "Copying $target_jar -> $dest_location"
cp "$target_jar" "$dest_location"

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
dest_location="$project_root/resources/modules/$driver_jar.pack.xz"

if [ -f "$dest_location" ]; then
    echo "$driver is already built."
    echo "To rebuild the driver, delete \"$dest_location\" and run this script again."
    exit 0
fi

mkdir -p resources/modules

echo "Deleting old versions of $driver driver..."
rm -f plugins/"$driver_jar"'*'
rm -f modules/resources/"$driver_jar"'*'

driver_project_dir="$project_root/modules/drivers/$driver"

# Check if Metabase is installed locally for building drivers; install it if not
if [ ! `find ~/.m2/repository/metabase-core/metabase-core -name '*.jar'` ]; then
    echo "Building Metabase and installing locally..."
    lein clean
    lein install-for-building-drivers
fi

# Generate Metabase uberjar blacklist file if needed!
uberjar_blacklist="$project_root/uberjar-blacklist.txt"

if [ ! -f "$uberjar_blacklist" ]; then
    echo 'Building Metabase uberjar...'
    lein uberjar
    jar -tf "$project_root/target/uberjar/metabase.jar" > "$uberjar_blacklist"
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

# Ok, now run the JAR compressor on the JAR

packed_target_jar="$target_jar.pack.xz"

pack200_skipped_files_list="$driver_project_dir/pack200-skipped-files.txt"

pack200_options="true"
if [ -f "$pack200_skipped_files_list" ]; then
    pack200_options="{:classes-to-skip \"$pack200_skipped_files_list\"}"
fi

lein compress-jar "$target_jar" \
     :blacklist "\"$uberjar_blacklist\"" \
     :pack200 "$pack200_options" \
     :out "\"$packed_target_jar\""

echo "File size before packing:"
du -h "$target_jar"

echo "File size after packing:"
du -h "$packed_target_jar"

echo "Copying $packed_target_jar -> $dest_location"
cp "$packed_target_jar" "$dest_location"

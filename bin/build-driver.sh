#! /usr/bin/env bash

set -eu

project_root=`pwd`

driver="$1"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh [driver]"
    exit -1
fi

driver_project_dir="$project_root/modules/drivers/$driver"
driver_jar="$driver.metabase-driver.jar"
dest_location="$project_root/resources/modules/$driver_jar"
metabase_uberjar="$project_root/target/uberjar/metabase.jar"
target_jar="$driver_project_dir/target/uberjar/$driver_jar"
parents=''
checksum_file="$driver_project_dir/target/checksum.txt"

######################################## CALCULATING CHECKSUMS ########################################

# Calculate a checksum of all the driver source files. If we've already built the driver and the checksum is the same
# there's no need to build the driver a second time
calculate_checksum() {
    find "$driver_project_dir" -name '*.clj' -or -name '*.yaml' | sort | cat | md5sum
}

# Check whether the saved checksum for the driver sources from the last build is the same as the current one. If so,
# we don't need to build again.
checksum_is_same() {
    result=""
    if [ -f "$checksum_file" ]; then
        old_checksum=`cat "$checksum_file"`
        if [ "$(calculate_checksum)" == "$old_checksum" ]; then
            # Make sure the target driver JAR actually exists as well!
            if [ -f "$target_jar" ]; then
                result="$driver driver source unchanged since last build. Skipping re-build."
            fi
        fi
    fi
    echo "$result"
}

######################################## BUILDING THE DRIVER ########################################

# Delete existing saved copies of the driver in the plugins and resources directories
delete_old_drivers() {
    echo "Deleting old versions of $driver driver..."
    rm -f plugins/"$driver_jar"
    rm -f "$dest_location"
}

# Check if Metabase is installed locally for building drivers; install it if not
install_metabase_core() {
    if [ ! "$(find ~/.m2/repository/metabase-core/metabase-core -name '*.jar')" ]; then
        echo "Building Metabase and installing locally..."
        lein clean
        lein install-for-building-drivers
    else
        echo "metabase-core already installed to local Maven repo."
    fi
}


# Build Metabase uberjar if needed, we'll need this for stripping duplicate classes
build_metabase_uberjar() {
    if [ ! -f "$metabase_uberjar" ]; then
        echo 'Building Metabase uberjar...'
        lein uberjar
    else
        echo "Metabase uberjar already built."
    fi
}

# Take a look at the `parents` file listing the parents to build, if applicable
build_parents() {
    echo "Building parent drivers (if needed)..."

    parents_list="$driver_project_dir"/parents

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

        # Check whether built parent driver *JAR* exists in local Maven repo
        parent_install_dir="~/.m2/repository/metabase/$parent-driver"
        parent_installed_jar=''
        if [ -f "$parent_install_dir" ]; then
            parent_installed_jar=`find "$parent_install_dir" -name '*.jar'`
        fi

        if [ ! "$parent_installed_jar" ]; then
            parent_project_dir="$project_root/modules/drivers/$parent"
            echo "Installing $parent locally..."
            cd "$parent_project_dir"
            lein clean
            lein install-for-building-drivers
            cd "$project_root"
        else
            echo "$parent already installed to local Maven repo"
        fi
    done
}

# Build the driver uberjar itself
build_driver_uberjar() {
    echo "Building $driver driver..."

    cd "$driver_project_dir"

    rm -rf target

    lein clean
    DEBUG=1 LEIN_SNAPSHOTS_IN_RELEASE=true lein uberjar

    cd "$project_root"

    if [ ! -f "$target_jar" ]; then
        echo "Error: could not find $target_jar. Build failed."
        exit -1
    fi
}

# Strip out any classes in driver JAR found in core Metabase uberjar or parent JARs; recompress with higher compression ratio
strip_and_compress() {
    # ok, first things first, strip out any classes also found in the core Metabase uberjar
    lein strip-and-compress "$target_jar"

    # next, remove any classes also found in any of the parent JARs
    for parent in $parents; do
        echo "Removing duplicate classes with $parent uberjar..."
        lein strip-and-compress "$target_jar" "resources/modules/$parent.metabase-driver.jar"
    done
}

# Save the checksum for the newly built JAR
save_checksum() {
    echo "Saving checksum for source files to $checksum_file"
    checksum=`calculate_checksum`
    echo "$checksum" > "$checksum_file"
}

# Runs all the steps needed to build the driver.
build_driver() {
    delete_old_drivers
    install_metabase_core
    build_metabase_uberjar
    build_parents
    build_driver_uberjar
    strip_and_compress
    save_checksum
}

######################################## PUTTING IT ALL TOGETHER ########################################

mkdir -p resources/modules

if [ ! "$(checksum_is_same)" ]; then
    build_driver
fi

# ok, finally, copy finished JAR to the resources dir
echo "Copying $target_jar -> $dest_location"
cp "$target_jar" "$dest_location"

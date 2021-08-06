#! /usr/bin/env bash

# functions for running prep steps to compile Java and AOT source files, needed before running other stuff.

script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."
project_root=`pwd`

clear_cpcaches() {
    cd "$project_root"
    for file in `find . -type d -name .cpcache`; do
        rm -rf "$file"
    done
}

do_prep() {
    clojure -Sforce -T:prep prep && echo "Sources => READY ✅"
}

prep_deps() {
    cd "$project_root"
    if [ ! -d "$project_root/java/target/classes" ] || [ ! -d "$project_root/modules/drivers/sparksql/target/classes" ]; then
        echo "Compiling Java and AOT sources..."
        if ! do_prep; then
            echo "Compilation failed! clearing classpath caches and trying again..."
            clear_cpcaches
            do_prep
        fi
    fi
}

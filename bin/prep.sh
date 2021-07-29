#! /usr/bin/env bash

# functions for running prep steps to compile Java and AOT source files, needed before running other stuff.

prep_deps() {
    # switch to project root directory if we're not already there
    script_directory=`dirname "${BASH_SOURCE[0]}"`
    cd "$script_directory/.."
    project_root=`pwd`

    if [ ! -d "$project_root/java/target/classes" ]; then
        echo 'Compile Java source files'
        cd "$project_root"
        clojure -X:deps prep
    fi

    if [ ! -d "$project_root/modules/drivers/sparksql/target/classes" ]; then
        echo 'Compile Spark SQL AOT source files'
        cd "$project_root/modules/drivers"
        clojure -X:deps prep
    fi

    cd "$project_root"
}

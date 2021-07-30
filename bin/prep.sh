#! /usr/bin/env bash

# functions for running prep steps to compile Java and AOT source files, needed before running other stuff.

prep_deps() {
    # switch to project root directory if we're not already there
    script_directory=`dirname "${BASH_SOURCE[0]}"`
    cd "$script_directory/.."
    project_root=`pwd`

    echo "Compile Java source files in $project_root/java if needed..."
    if [ ! -d "$project_root/java/target/classes" ]; then
        echo 'Compile Java source files'
        cd "$project_root"
        clojure -Sforce -X:deps prep
    else
        echo 'Java source files are already compiled'
    fi

    echo "Compile Spark SQL AOT source files in $project_root/modules/drivers/sparksql if needed..."
    if [ ! -d "$project_root/modules/drivers/sparksql/target/classes" ]; then
        echo 'Compile Spark SQL AOT source files'
        cd "$project_root/modules/drivers"
        clojure -Sforce -X:deps prep
    else
        echo 'Spark SQL AOT source files are already compiled'
    fi

    cd "$project_root"
}

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

compile_java_sources() {
    cd "$project_root"

    echo "Compile Java source files in $project_root/java if needed..."
    if [ ! -d "$project_root/java/target/classes" ]; then
        echo 'Compile Java source files'
        cd "$project_root"
        clojure -Sforce -X:deps prep
    else
        echo 'Java source files are already compiled'
    fi
}

compile_spark_sql_aot_sources() {
    cd "$project_root"

    echo "Compile Spark SQL AOT source files in $project_root/modules/drivers/sparksql if needed..."
    if [ ! -d "$project_root/modules/drivers/sparksql/target/classes" ]; then
        echo 'Compile Spark SQL AOT source files'
        cd "$project_root/modules/drivers"
        clojure -Sforce -X:deps prep
    else
        echo 'Spark SQL AOT source files are already compiled'
    fi
}

prep_deps() {
    if compile_java_sources; then
        echo "Java sources => OK"
    else
        echo 'Compilation failed (WHY?!); clearing classpath caches and trying again...'
        clear_cpcaches
        compile_java_sources
    fi

    if compile_spark_sql_aot_sources; then
        echo "Spark SQL AOT sources => OK"
    else
        echo 'Compilation failed (WHY?!); clearing classpath caches and trying again...'
        clear_cpcaches
        compile_spark_sql_aot_sources
    fi

    cd "$project_root"
}

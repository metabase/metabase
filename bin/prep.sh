#! /usr/bin/env bash

# functions for running prep steps to compile Java and AOT source files, needed before running other stuff.

prep_deps() {
    # switch to project root directory if we're not already there
    script_directory=`dirname "${BASH_SOURCE[0]}"`
    cd "$script_directory/.."
    project_root=`pwd`

    echo 'Compile Java source files if needed'
    cd "$project_root"
    clojure -X:deps prep

    echo 'Compile driver AOT source files if needed'
    cd "$project_root/modules/drivers"
    clojure -X:deps prep

    cd "$project_root"
}

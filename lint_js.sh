#! /bin/bash

# Simple shell script for running jshint and nicely formatting the output :heart_eyes_cat:

JS_HINT=./node_modules/jsxhint/cli.js
JS_HINT_OPTS='--config .jshintrc'
JS_FILES=`find resources/frontend_client/app -name "*.js" | grep -v bower_components | grep -v 'app/test/' | grep -v '\#' | grep -v 'app/dist/'`

BOLD='\033[1;30m'
RED='\033[0;31m' # \e doesn't work on OS X but \033 works on either
NC='\033[0m'

HAS_ERROR=0

# Make the .js_hint_output dir if needed
if [ ! -d .js_hint_output ]; then
    mkdir .js_hint_output
fi

# cache file names are are just filename with '/' replaced by '_' and stuck in the .js_hint_output dir
cache_file_name () {
    echo ".js_hint_output/"`echo $1 | sed 's:/:_:g'`
}

# return unix timestamp for file or 0 if it doesn't exist

# find out if stat supports --format (Linux or Mac w/ updated coreutils via homebrew) or
# if we need to use -c (default OS X)
# OS X version doesn't support --version so see if doing that returns non-zero exit code
if (( `stat --version >/dev/null 2>/dev/null; echo "$?"` )); then
    STAT_FORMAT_FLAG='-f%m';
else
    STAT_FORMAT_FLAG='--format=%Y';
fi
file_modified () {
    file=$1
    if [ -f "$file" ] && [ -n "$file" ]; then # make sure filename is non-empty, -f will return true otherwise
         echo `stat $STAT_FORMAT_FLAG $file`
    else
        echo "0";
    fi
}

# Default output repeats file name on every offending line;
# Instead, we'll print the filename once in bold for all bad files
# and then print just the errors in red
run_js_lint () {
    file=$1
    output_file=$2
    $JS_HINT $JS_HINT_OPTS $file | perl -pe 's/^.*(line.*)$/$1/' | sort > $output_file
}

for file in $JS_FILES; do
    # Find matching cached output if file hasn't changed since last run
    cache_file=$(cache_file_name $file)

    # get file modified dates
    file_modified_date=$(file_modified $file)
    cache_file_modified_date=$(file_modified $cache_file)

    # run js lint to (re-)generate cache file if it's older than $file
    if [ $cache_file_modified_date -lt $file_modified_date ]; then
        run_js_lint $file $cache_file
    fi

    # ok, output the cached file either way
    errors=$(cat $cache_file)
    if [ -n "$errors" ]; then
        echo -e "\n\n"${BOLD}"$file"
        echo -e ${RED}
        echo "$errors"
        echo -e ${NC}
        HAS_ERROR=1
    fi
done

if [[ $HAS_ERROR -eq 1 ]]; then
    exit 1
else
    exit 0
fi

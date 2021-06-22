#! /usr/bin/env bash

set -eo pipefail

for file in `find java -name '*.java'`; do
    echo "Maybe compile $file"
    classfile=$(echo "$file" | sed 's/.java/.class/')
    if [ "$file" -nt "$classfile" ]; then
        echo "Compile $file"
        javac -cp $(clojure -Spath) -target 1.8 -source 1.8 "$file";
    fi
done

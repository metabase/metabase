#!/bin/bash -e

tmp=$(mktemp)
BASEDIR=`dirname $0`/..

cd $BASEDIR

PATH=$(pwd)/dist:$PATH

OLDVER=$(sed -e "s/\./\\\\./" VERSION)
VER=$1

echo "Modifying Installer version to: $VER"
echo $1 > VERSION


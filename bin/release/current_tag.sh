#!/bin/bash

# use git to tell us what tag we are on
# NOTE: if we happen to NOT be on a tagged commit this will be "undefined"
MB_TAG=$(git name-rev --tags --name-only HEAD)

# this strips off the ^0 that ends up on the end of our tag when we grab it
MB_TAG=${MB_TAG%^0}

# if we didn't get a tag then consider this a failed execution and respond with exit code 1
if [ "$MB_TAG" == "undefined" -o $? -eq 1 ]; then
    exit 1
fi

echo $MB_TAG

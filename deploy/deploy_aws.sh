#!/bin/bash
# for reference
# CIRCLE_SHA1=a3262e9b60a25e6a8a7faa29478b2b455b5ec4a3
# CIRCLE_BRANCH=master

if [ $# -ne 2 ]; then
    echo "usage: $0 stackid appid"
    exit 1
fi

STACKID=$1
APPID=$2
echo "deploying $CIRCLE_SHA1 from $CIRCLE_BRANCH ..."
aws opsworks create-deployment --stack-id $STACKID --app-id $APPID --comment "deploying $CIRCLE_SHA1 from $CIRCLE_BRANCH" --command='{"Name": "deploy"}'

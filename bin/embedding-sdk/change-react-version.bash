#!/bin/bash

function backup_packages() {
  cp yarn.lock yarn.lock.backup
  cp package.json package.json.backup
}

function restore_packages() {
  mv yarn.lock.backup yarn.lock
  mv package.json.backup package.json
}

function use_react_19() {
  yarn add react@^19 react-dom@^19
}

if [ "$1" == "19" ]; then
  backup_packages
  use_react_19
  exit 0
elif [ "$1" == "restore" ]; then
  restore_packages
  exit 0
elif [ "$1" == "" ]; then
  echo "Usage: ./bin/embedding-sdk/change-react-version.bash [19|restore]"
  exit 1
fi



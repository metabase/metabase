#!/bin/bash

function backup_package_files() {
  cp yarn.lock yarn.lock.backup
  cp package.json package.json.backup
}

function restore_package_files() {
  mv yarn.lock.backup yarn.lock
  mv package.json.backup package.json
}

function use_react_version() {
  local version=$1

  if [[ ! $version =~ ^[0-9]+$ ]]; then
    echo "Error: Version must be a number"
    exit 1
  fi

  yarn add react@^$version react-dom@^$version
}

function print_usage() {
  echo "Usage: ./bin/embedding-sdk/change-react-version.bash [VERSION|restore]"
  echo
  echo "Examples:"
  echo "  ./bin/embedding-sdk/change-react-version.bash 18    # Switch to React 18"
  echo "  ./bin/embedding-sdk/change-react-version.bash 19    # Switch to React 19"
  echo "  ./bin/embedding-sdk/change-react-version.bash restore    # Restore original package files"
}

if [[ "$1" =~ ^[0-9]+$ ]]; then
  backup_package_files
  use_react_version "$1"
  exit 0
elif [ "$1" == "restore" ]; then
  restore_package_files
  exit 0
else
  print_usage
  exit 1
fi

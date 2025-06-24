#! /usr/bin/env bash

function prepare_files() {
  cp ./bin/embedding-sdk/templates/package.json docs/embedding/
  cp ./bin/embedding-sdk/templates/yarn.lock docs/embedding/
}

function install_dependencies() {
  yarn --cwd ./docs/embedding install --frozen-lockfile
}

function type_check() {
  tsc --project ./docs/embedding/tsconfig.json
}

function cleanup_files() {
  rm -f ./docs/embedding/package.json
  rm -f ./docs/embedding/yarn.lock
}

cleanup_files
prepare_files
install_dependencies
type_check
cleanup_files

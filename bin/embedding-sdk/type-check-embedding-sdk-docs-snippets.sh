#! /usr/bin/env bash

function prepare_files() {
  cp ./bin/embedding-sdk/templates/package.json docs/embedding/
  cp ./bin/embedding-sdk/templates/bun.lockb docs/embedding/
}

function install_dependencies() {
  cd ./docs/embedding && bun install --frozen-lockfile && cd ../..
}

function type_check() {
  tsc --project ./docs/embedding/tsconfig.json
}

function cleanup_files() {
  rm -f ./docs/embedding/package.json
  rm -f ./docs/embedding/bun.lockb
}

cleanup_files
prepare_files
install_dependencies
type_check
cleanup_files

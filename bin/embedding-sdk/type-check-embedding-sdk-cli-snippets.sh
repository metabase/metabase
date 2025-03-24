#! /usr/bin/env bash

function prepare_files() {
  tsx ./enterprise/frontend/src/embedding-sdk/bin/generate-cli-snippets-for-testing.ts
}

function install_dependencies() {
  yarn --cwd ./enterprise/frontend/src/embedding-sdk/cli-snippets-tmp/express-server install --frozen-lockfile
}

function type_check() {
  tsc --project ./enterprise/frontend/src/embedding-sdk/tsconfig.cli-snippets.json
}

function cleanup_files() {
  rm -rf ./enterprise/frontend/src/embedding-sdk/cli-snippets-tmp
}

cleanup_files
prepare_files
install_dependencies
type_check
cleanup_files

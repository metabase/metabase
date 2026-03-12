#! /usr/bin/env bash

function prepare_files() {
  tsx ./enterprise/frontend/src/embedding-sdk-package/bin/generate-cli-snippets-for-testing.ts
}

function install_dependencies() {
  bun install --cwd ./enterprise/frontend/src/embedding-sdk-package/cli-snippets-tmp/express-server --frozen-lockfile
}

function type_check() {
  tsc --project ./enterprise/frontend/src/embedding-sdk-package/tsconfig.cli-snippets.json
}

function cleanup_files() {
  rm -rf ./enterprise/frontend/src/embedding-sdk-package/cli-snippets-tmp
}

cleanup_files
prepare_files
install_dependencies
type_check
cleanup_files

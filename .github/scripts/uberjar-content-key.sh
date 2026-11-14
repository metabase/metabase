#!/usr/bin/env bash
# Prints a hash of the tracked files that can change the uberjar.
#
# Two commits with the same hash build the same uberjar, apart from the commit hash and date in
# `version.properties`, so `uberjar.yml` reuses an existing JAR instead of building it again.
#
# Every tracked file counts unless it's excluded below, so a file the list misses only costs a
# rebuild. Only exclude paths that never end up in the uberjar and never change how it's built.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

{
  git ls-files --stage -- . \
    ':(exclude)e2e' \
    ':(exclude)test' \
    ':(exclude)test_resources' \
    ':(exclude)test_modules' \
    ':(exclude)enterprise/backend/test' \
    ':(glob,exclude)modules/drivers/*/test/**' \
    ':(exclude)frontend/test' \
    ':(exclude)docs' \
    ':(exclude)dev' \
    ':(exclude)release' \
    ':(exclude).clj-kondo' \
    ':(exclude).storybook' \
    ':(exclude).claude' \
    ':(exclude).github' \
    ':(glob,exclude)**/*.unit.spec.*' \
    ':(glob,exclude)**/*.stories.*' \
    ':(glob,exclude)*.md'

  # The parts of `.github` that set up the build toolchain or decide how the JAR is built.
  git ls-files --stage -- \
    .github/workflows/uberjar.yml \
    .github/actions/prepare-frontend \
    .github/actions/prepare-backend \
    .github/actions/prepare-node-bun \
    .github/scripts/cache-keys.sh \
    .github/scripts/uberjar-content-key.sh
} | sha256sum | cut -d ' ' -f 1

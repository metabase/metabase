#! /bin/bash

trap "echo 'Interrupted! Exiting.'; exit 1" SIGINT

# This script is used to run the all dev checks with a single command.

echo "Building CLJS..."
yarn build:cljs
if [ $? -ne 0 ]; then
  echo "Error: Building CLJS failed." >&2
  exit 1
fi
echo "Building CLJS done"

echo "Linting ESLint..."
yarn lint-eslint-pure
if [ $? -ne 0 ]; then
  echo "Error: Linting ESLint failed." >&2
  exit 1
fi
echo "Linting ESLint done"

echo "Linting Prettier..."
yarn lint-prettier-pure
if [ $? -ne 0 ]; then
  echo "Error: Linting Prettier failed." >&2
  exit 1
fi
echo "Linting Prettier done"

echo "Type checking..."
yarn type-check-pure
if [ $? -ne 0 ]; then
  echo "Error: Type checking failed." >&2
  exit 1
fi
echo "Type checking done"

# log success
echo "All checks passed!"

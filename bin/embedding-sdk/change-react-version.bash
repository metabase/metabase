#!/bin/bash

function restore_package_files() {
  git checkout -- bun.lock package.json
}

function pin_react_resolutions() {
  # `resolutions` overrides every react/react-dom version, so a plain `bun add
  # react@^18` still installs the version pinned there. Rewrite the pins to the
  # target major first, otherwise the React 18 job silently runs React 19.
  local version=$1
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const range = "^" + process.argv[1] + ".0.0";
    for (const key of ["react", "react-dom", "@types/react", "@types/react-dom"]) {
      if (pkg.resolutions && key in pkg.resolutions) {
        pkg.resolutions[key] = range;
      }
    }
    fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  ' "$version"
}

function assert_react_version() {
  local version=$1
  local installed=$(node -e 'console.log(require("react/package.json").version)')
  if [[ "$installed" != "$version."* ]]; then
    echo "Error: expected React $version.x but node_modules has $installed"
    exit 1
  fi
  echo "React $installed is installed"
}

function install_packages() {
  local version=$1
  local cypress_react_package=$(get_cypress_react_package "$version")
  local dependencies="react@^$version react-dom@^$version $cypress_react_package"

  if [[ ! $version =~ ^[0-9]+$ ]]; then
    echo "Error: Version must be a number"
    exit 1
  fi

  pin_react_resolutions "$version"

  # Install React and Cypress React test harness
  echo "Installing $dependencies"
  bun add $dependencies

  assert_react_version "$version"
}

function print_usage() {
  echo "Usage: ./bin/embedding-sdk/change-react-version.bash [VERSION|restore]"
  echo
  echo "Examples:"
  echo "  ./bin/embedding-sdk/change-react-version.bash 18    # Switch to React 18"
  echo "  ./bin/embedding-sdk/change-react-version.bash 19    # Switch to React 19"
  echo "  ./bin/embedding-sdk/change-react-version.bash restore    # Restore original package files"
}

# React 19+ uses @cypress/react@^9
# React 18 uses cypress/react18, an internal package in Cypress 13 -- @cypress/react@^8 is installed to prevent import errors.
# React 17 uses @cypress/react@^8 (only supported on 53 and below)
# See https://docs.cypress.io/app/references/migration-guide#To-continue-using-React-below-v18
function get_cypress_react_package() {
  local version=$1

  if [[ $version -ge 19 ]]; then
    echo "@cypress/react@^9"
  else
    echo "@cypress/react@^8"
  fi
}

if [[ "$1" =~ ^[0-9]+$ ]]; then
  install_packages "$1"
  exit 0
elif [ "$1" == "restore" ]; then
  restore_package_files
  exit 0
else
  print_usage
  exit 1
fi

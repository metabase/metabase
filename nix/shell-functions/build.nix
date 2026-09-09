# nix/shell-functions/build.nix
#
# Build helpers for the dev shell.
#
{ }:

''
  mb-build() {
    echo "Building Metabase (full build)..."
    cd "$MB_PROJECT_ROOT" && clojure -X:drivers:build:build/all "$@"
  }

  mb-build-frontend() {
    echo "Building frontend..."
    cd "$MB_PROJECT_ROOT" && bun install && bun run build-release
  }

  mb-build-backend() {
    echo "Building uberjar..."
    cd "$MB_PROJECT_ROOT" && clojure -X:build:build/uberjar "$@"
  }

  mb-repl() {
    echo "Starting Clojure REPL with :dev alias..."
    cd "$MB_PROJECT_ROOT" && clojure -A:dev "$@"
  }

  mb-build-drivers() {
    echo "Building drivers..."
    cd "$MB_PROJECT_ROOT" && clojure -X:build:drivers:build/drivers "$@"
  }

  mb-build-i18n() {
    echo "Building i18n artifacts..."
    cd "$MB_PROJECT_ROOT" && clojure -X:build:build/i18n
  }
''

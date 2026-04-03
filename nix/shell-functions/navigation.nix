# nix/shell-functions/navigation.nix
#
# Directory navigation helpers for the dev shell.
#
{ }:

''
  mb-src() {
    cd "$MB_PROJECT_ROOT/src/metabase" || return 1
    echo "→ src/metabase"
  }

  mb-frontend() {
    cd "$MB_PROJECT_ROOT/frontend" || return 1
    echo "→ frontend"
  }

  mb-test() {
    cd "$MB_PROJECT_ROOT/test" || return 1
    echo "→ test"
  }

  mb-drivers() {
    cd "$MB_PROJECT_ROOT/modules/drivers" || return 1
    echo "→ modules/drivers"
  }

  mb-root() {
    cd "$MB_PROJECT_ROOT" || return 1
    echo "→ project root"
  }
''

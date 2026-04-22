# nix/shell-functions/clean.nix
#
# Cleanup helpers for the dev shell.
#
{ }:

''
  mb-clean-frontend() {
    echo "Cleaning frontend artifacts..."
    rm -rf "$MB_PROJECT_ROOT/node_modules"
    rm -rf "$MB_PROJECT_ROOT/resources/frontend_client"
    echo "Done."
  }

  mb-clean-backend() {
    echo "Cleaning backend artifacts..."
    rm -rf "$MB_PROJECT_ROOT/target"
    echo "Done."
  }

  mb-clean-all() {
    mb-clean-frontend
    mb-clean-backend
    echo "All clean."
  }
''

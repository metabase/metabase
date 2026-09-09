# nix/devshell.nix
#
# Developer shell with all tools, env vars, and helper functions.
#
{
  pkgs,
  lib,
  envVars,
  packages,
}:

let
  navigationFns = import ./shell-functions/navigation.nix { };
  buildFns = import ./shell-functions/build.nix { };
  cleanFns = import ./shell-functions/clean.nix { };
  databaseFns = import ./shell-functions/database.nix { inherit pkgs; };
  validationFns = import ./shell-functions/validation.nix { };
in
pkgs.mkShell {
  nativeBuildInputs = packages.nativeBuildInputs ++ packages.devTools;
  buildInputs = packages.buildInputs;

  shellHook = ''
    # Project root for shell functions
    export MB_PROJECT_ROOT="$PWD"

    # Environment variables
    ${envVars}

    # Shell functions
    ${navigationFns}
    ${buildFns}
    ${cleanFns}
    ${databaseFns}
    ${validationFns}

    # Colored prompt
    export PS1='\[\033[1;36m\][metabase-nix]\[\033[0m\] \w \$ '

    # Welcome message
    echo ""
    echo "Metabase Nix Dev Shell"
    echo "══════════════════════"
    echo ""
    echo "  Java:       $(java -version 2>&1 | head -1)"
    echo "  Clojure:    $(clojure --version 2>&1)"
    echo "  Node:       $(node --version)"
    echo "  Bun:        $(bun --version)"
    echo "  PostgreSQL: $(postgres --version)"
    echo ""
    echo "  Type 'mb-help' for available commands."
    echo ""
  '';
}

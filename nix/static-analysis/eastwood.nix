# nix/static-analysis/eastwood.nix
#
# Thin wrapper around the existing :eastwood alias in deps.edn.
# Provides `nix run .#check-eastwood` for environments without Clojure CLI.
#
# Usage:
#   nix run .#check-eastwood
#
{ pkgs, src }:

let
  jdk = pkgs.temurin-bin-21;
  clojure = pkgs.clojure;
in
pkgs.writeShellApplication {
  name = "mb-check-eastwood";
  runtimeInputs = [
    jdk
    clojure
    pkgs.git
  ];
  text = ''
    set -euo pipefail

    echo "=== Eastwood (via deps.edn :eastwood) ==="
    echo ""

    # Must run from the Metabase project root (writable working directory)
    if [ ! -f deps.edn ]; then
      echo "ERROR: deps.edn not found. Run this from the Metabase project root."
      exit 1
    fi

    export JAVA_HOME="${jdk}"

    clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood
  '';
}

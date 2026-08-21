# nix/static-analysis/kondo.nix
#
# Thin wrapper around the existing :kondo/:kondo/all alias in deps.edn.
# Provides `nix run .#check-kondo` for environments without Clojure CLI.
#
# Usage:
#   nix run .#check-kondo
#
{ pkgs, src }:

let
  jdk = pkgs.temurin-bin-21;
  clojure = pkgs.clojure;
in
pkgs.writeShellApplication {
  name = "mb-check-kondo";
  runtimeInputs = [
    jdk
    clojure
    pkgs.git
  ];
  text = ''
    set -euo pipefail

    echo "=== clj-kondo (via deps.edn :kondo/:kondo/all) ==="
    echo ""

    # Must run from the Metabase project root (writable working directory)
    if [ ! -f deps.edn ]; then
      echo "ERROR: deps.edn not found. Run this from the Metabase project root."
      exit 1
    fi

    export JAVA_HOME="${jdk}"

    clojure -M:kondo:kondo/all
  '';
}

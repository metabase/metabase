# nix/static-analysis/kibit.nix
#
# Kibit: idiomatic Clojure code suggestions.
# Scans source paths and suggests more idiomatic rewrites.
#
# Usage:
#   nix run .#check-kibit
#   nix run .#check-kibit -- --paths src           # scan specific paths
#
{ pkgs, src }:

let
  jdk = pkgs.temurin-bin-21;
  clojure = pkgs.clojure;
in
pkgs.writeShellApplication {
  name = "mb-check-kibit";
  runtimeInputs = [
    jdk
    clojure
    pkgs.git
  ];
  text = ''
    set -euo pipefail

    echo "=== Kibit (idiomatic Clojure suggestions) ==="
    echo ""

    # Must run from the Metabase project root (writable working directory)
    if [ ! -f deps.edn ]; then
      echo "ERROR: deps.edn not found. Run this from the Metabase project root."
      exit 1
    fi

    export JAVA_HOME="${jdk}"

    # Default source paths to scan
    PATHS=(
      "src"
      "enterprise/backend/src"
      "modules/drivers/clickhouse/src"
    )

    # Allow overriding paths
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --paths) shift; PATHS=("$@"); break ;;
        *) echo "Unknown option: $1"; exit 1 ;;
      esac
    done

    echo "Scanning: ''${PATHS[*]}"
    echo ""

    # kibit.driver -main is broken on Clojure 1.12+, so use the API directly.
    # kibit.check/check-file returns suggestions as maps; we format them here.
    KIBIT_SCRIPT='
    (require (quote [kibit.check :as k])
             (quote [clojure.java.io :as io]))
    (let [paths (rest *command-line-args*)
          count (atom 0)]
      (doseq [p paths
              f (file-seq (io/file p))
              :when (and (.isFile f)
                         (re-matches #".*\.clj[cs]?" (.getName f)))]
        (try
          (doseq [{:keys [file line expr alt]} (k/check-file f)]
            (swap! count inc)
            (printf "At %s:%d:\n  Consider using:\n    %s\n  instead of:\n    %s\n\n"
                    (str file) line (pr-str alt) (pr-str expr)))
          (catch Exception e
            (binding [*out* *err*]
              (printf "WARN: Could not analyze %s: %s\n" (str f) (.getMessage e))))))
      (printf "\nKibit found %d suggestions.\n" @count)
      (System/exit (if (pos? @count) 1 0)))
    '

    clojure -Sdeps '{:deps {jonase/kibit {:mvn/version "0.1.8"}}}' \
      -M -e "$KIBIT_SCRIPT" -- "''${PATHS[@]}"
  '';
}

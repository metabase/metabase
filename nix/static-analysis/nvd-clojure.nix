# nix/static-analysis/nvd-clojure.nix
#
# nvd-clojure: CVE scanning of all Maven dependencies.
# Checks the project's dependency tree against the National Vulnerability Database.
#
# Requires:
#   - Network access (must be `nix run`, not `nix build`)
#   - NVD API key at ~/.ssh/NIST-NVD-KEY (or NVD_API_TOKEN env var)
#     Get a free key: https://nvd.nist.gov/developers/request-an-api-key
#
# Usage:
#   nix run .#check-nvd
#   NVD_API_TOKEN=your-key nix run .#check-nvd    # explicit key
#
{ pkgs, src }:

let
  jdk = pkgs.temurin-bin-21;
  clojure = pkgs.clojure;
in
pkgs.writeShellApplication {
  name = "mb-check-nvd";
  runtimeInputs = [
    jdk
    clojure
    pkgs.git
  ];
  text = ''
    set -euo pipefail

    echo "=== nvd-clojure (CVE dependency scanning) ==="
    echo ""

    # Must run from the Metabase project root (writable working directory)
    if [ ! -f deps.edn ]; then
      echo "ERROR: deps.edn not found. Run this from the Metabase project root."
      exit 1
    fi

    export JAVA_HOME="${jdk}"

    # ── Resolve NVD API key ──────────────────────────────────────────
    # Since 2023, NVD requires an API key for data feed access.
    # Check: env var > ~/.ssh/NIST-NVD-KEY file
    NVD_KEY_FILE="$HOME/.ssh/NIST-NVD-KEY"

    if [ -z "''${NVD_API_TOKEN:-}" ]; then
      if [ -f "$NVD_KEY_FILE" ]; then
        NVD_API_TOKEN=$(tr -d '[:space:]' < "$NVD_KEY_FILE")
        export NVD_API_TOKEN
        echo "Using NVD API key from $NVD_KEY_FILE"
      else
        echo "ERROR: NVD API key not found."
        echo ""
        echo "The NVD requires an API key since 2023. Either:"
        echo "  1. Set NVD_API_TOKEN environment variable"
        echo "  2. Place your key in $NVD_KEY_FILE"
        echo ""
        echo "Get a free key: https://nvd.nist.gov/developers/request-an-api-key"
        exit 1
      fi
    else
      echo "Using NVD API key from NVD_API_TOKEN environment variable"
    fi

    echo ""
    echo "Scanning dependency tree for known CVEs..."
    echo ""

    # ── Resolve classpath ────────────────────────────────────────────
    CLASSPATH_STR=$(clojure -A:dev:ee:drivers -Spath)

    # ── Create config with API key ──────────────────────────────────
    NVD_CONFIG=$(mktemp --suffix=.json)
    trap 'rm -f "$NVD_CONFIG"' EXIT

    printf '{"nvd": {"nvd-api": {"key": "%s", "delay": 4000, "valid-for-hours": 24}}}\n' "$NVD_API_TOKEN" > "$NVD_CONFIG"

    # ── Run nvd-clojure ──────────────────────────────────────────────
    # Install as tool if not present
    if ! clojure -Tnvd nvd.task/check --help > /dev/null 2>&1; then
      echo "Installing nvd-clojure tool..."
      clojure -Ttools install nvd-clojure/nvd-clojure '{:mvn/version "5.3.0"}' :as nvd
      echo ""
    fi

    clojure -Tnvd nvd.task/check \
      :classpath "\"$CLASSPATH_STR\"" \
      :config-filename "\"$NVD_CONFIG\""
  '';
}

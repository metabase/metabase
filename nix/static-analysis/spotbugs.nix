# nix/static-analysis/spotbugs.nix
#
# SpotBugs 4.8.6 + FindSecBugs 1.13.0 bytecode analysis.
# Operates on the AOT-compiled Metabase uberjar to find security issues,
# resource leaks, and null-dereference paths in both Clojure-compiled
# bytecode and transitive Java dependencies (clickhouse-jdbc, etc.).
#
# Usage:
#   nix run .#check-spotbugs                  # full uberjar (very slow — see below)
#   nix run .#check-spotbugs -- --only-analyze 'metabase.driver.clickhouse.*,com.clickhouse.*'
#   nix run .#check-spotbugs -- --effort default  # lighter analysis pass
#   nix run .#check-spotbugs -- --xml         # also produce XML report
#
# Performance note:
#   The Metabase uberjar is ~400MB of AOT-compiled Clojure bytecode. SpotBugs'
#   null-pointer dataflow analysis is single-threaded and has near-exponential
#   complexity on the bytecode patterns Clojure AOT generates. Full-uberjar
#   analysis with effort:max ran for 10+ hours on a Threadripper PRO 3945WX
#   without completing. The bottleneck is CPU, not memory (RSS stabilizes at
#   ~12GB well under the 16GB heap).
#
#   Recommended: use --only-analyze to target specific packages.
#   Example for ClickHouse driver + JDBC dependencies:
#     nix run .#check-spotbugs -- --only-analyze \
#       'metabase.driver.clickhouse.*,com.clickhouse.*'
#
{
  pkgs,
  uberjar,
}:

let
  jdk = pkgs.temurin-bin-21;

  spotbugsVersion = "4.8.6";
  findSecBugsVersion = "1.13.0";

  spotbugsTarball = pkgs.fetchurl {
    url = "https://github.com/spotbugs/spotbugs/releases/download/${spotbugsVersion}/spotbugs-${spotbugsVersion}.tgz";
    sha256 = "sha256-udTSXlPNQgKy3BnFScD/VPinL8dqcajEDe6UQixn6+o=";
  };

  findSecBugsJar = pkgs.fetchurl {
    url = "https://repo1.maven.org/maven2/com/h3xstream/findsecbugs/findsecbugs-plugin/${findSecBugsVersion}/findsecbugs-plugin-${findSecBugsVersion}.jar";
    sha256 = "sha256-wjl2Oowye1+2U6NN7OY5hXi/Q1uaMsISu44avnATaKU=";
  };

in
pkgs.writeShellApplication {
  name = "mb-check-spotbugs";
  runtimeInputs = [
    jdk
    pkgs.coreutils
    pkgs.gnutar
    pkgs.gzip
  ];
  text = ''
    set -euo pipefail

    echo "=== SpotBugs ${spotbugsVersion} + FindSecBugs ${findSecBugsVersion} ==="
    echo ""

    # ── Parse arguments ──────────────────────────────────────────────
    EFFORT="max"
    PRODUCE_XML=false
    ONLY_ANALYZE=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --effort) EFFORT="$2"; shift 2 ;;
        --xml) PRODUCE_XML=true; shift ;;
        --only-analyze) ONLY_ANALYZE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
      esac
    done

    # ── Extract SpotBugs ─────────────────────────────────────────────
    WORK=$(mktemp -d)
    trap 'rm -rf "$WORK"' EXIT

    echo "Extracting SpotBugs..."
    tar xzf "${spotbugsTarball}" -C "$WORK"
    SPOTBUGS_HOME="$WORK/spotbugs-${spotbugsVersion}"
    chmod +x "$SPOTBUGS_HOME/bin/spotbugs"

    # ── Install FindSecBugs plugin ───────────────────────────────────
    cp "${findSecBugsJar}" "$SPOTBUGS_HOME/plugin/findsecbugs-plugin-${findSecBugsVersion}.jar"

    # ── Locate uberjar ───────────────────────────────────────────────
    UBERJAR="${uberjar}/share/metabase/metabase.jar"
    if [ ! -f "$UBERJAR" ]; then
      echo "ERROR: uberjar not found at $UBERJAR"
      echo "Build it first: nix build .#uberjar"
      exit 1
    fi

    # ── Exclusion filter ─────────────────────────────────────────────
    EXCLUDE_FILTER="${../.. + "/config/static-analysis/spotbugs-exclude.xml"}"

    # ── Output directory ─────────────────────────────────────────────
    REPORT_DIR="$PWD/spotbugs-report"
    mkdir -p "$REPORT_DIR"

    # ── Run SpotBugs ─────────────────────────────────────────────────
    echo "Analyzing uberjar (effort: $EFFORT)..."
    echo "  JAR: $UBERJAR"
    echo "  Exclusions: $EXCLUDE_FILTER"
    if [ -n "$ONLY_ANALYZE" ]; then
      echo "  Only analyzing: $ONLY_ANALYZE"
    fi
    echo ""

    SPOTBUGS_ARGS=(
      -textui
      "-effort:$EFFORT"
      -maxHeap 24576
      -exclude "$EXCLUDE_FILTER"
      -longBugCodes
      -sortByClass
      -nested:false
    )

    if [ -n "$ONLY_ANALYZE" ]; then
      SPOTBUGS_ARGS+=(-onlyAnalyze "$ONLY_ANALYZE")
    fi

    SPOTBUGS_ARGS+=("$UBERJAR")

    if [ "$PRODUCE_XML" = true ]; then
      SPOTBUGS_ARGS+=(-xml:withMessages -output "$REPORT_DIR/spotbugs.xml")
      echo "XML report will be saved to: $REPORT_DIR/spotbugs.xml"
    fi

    export JAVA_HOME="${jdk}"

    "$SPOTBUGS_HOME/bin/spotbugs" "''${SPOTBUGS_ARGS[@]}" \
      2>&1 | tee "$REPORT_DIR/spotbugs.txt"

    echo ""
    echo "Text report saved to: $REPORT_DIR/spotbugs.txt"
    if [ "$PRODUCE_XML" = true ]; then
      echo "XML report saved to: $REPORT_DIR/spotbugs.xml"
    fi
  '';
}

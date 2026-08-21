# nix/static-analysis/default.nix
#
# Static analysis entry point. Imports all analyzers and exposes them
# as an attribute set plus a combined runner.
#
# Attribute set:
#   spotbugs    - SpotBugs + FindSecBugs bytecode analysis
#   nvdClojure  - CVE dependency scanning
#   kibit       - Idiomatic Clojure suggestions
#   kondo       - clj-kondo lint (wraps existing alias)
#   eastwood    - Eastwood deep analysis (wraps existing alias)
#   all         - Runs all analyzers sequentially
#
{
  pkgs,
  lib,
  uberjar,
  src,
}:

let
  spotbugs = import ./spotbugs.nix { inherit pkgs uberjar; };
  nvdClojure = import ./nvd-clojure.nix { inherit pkgs src; };
  kibit = import ./kibit.nix { inherit pkgs src; };
  kondo = import ./kondo.nix { inherit pkgs src; };
  eastwood = import ./eastwood.nix { inherit pkgs src; };

  all = pkgs.writeShellApplication {
    name = "mb-check-all-static";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      echo "========================================"
      echo "  Metabase Static Analysis"
      echo "========================================"
      echo ""

      FAILED=""
      PASSED=""
      TOTAL_START=$(date +%s)

      run_check() {
        local name="$1"
        local script="$2"
        echo ""
        echo "── $name ──"
        START=$(date +%s)
        if $script; then
          END=$(date +%s)
          ELAPSED=$((END - START))
          PASSED="$PASSED $name"
          echo "  Result: PASS ($ELAPSED s)"
        else
          END=$(date +%s)
          ELAPSED=$((END - START))
          FAILED="$FAILED $name"
          echo "  Result: FAIL ($ELAPSED s)"
        fi
      }

      run_check "kondo"    "${kondo}/bin/mb-check-kondo"
      run_check "eastwood" "${eastwood}/bin/mb-check-eastwood"
      run_check "kibit"    "${kibit}/bin/mb-check-kibit"
      run_check "spotbugs" "${spotbugs}/bin/mb-check-spotbugs"
      run_check "nvd"      "${nvdClojure}/bin/mb-check-nvd"

      TOTAL_END=$(date +%s)
      TOTAL_TIME=$((TOTAL_END - TOTAL_START))

      echo ""
      echo "========================================"
      echo "  Summary ($TOTAL_TIME s)"
      echo "========================================"
      if [ -n "$PASSED" ]; then
        echo "  PASSED:$PASSED"
      fi
      if [ -n "$FAILED" ]; then
        echo "  FAILED:$FAILED"
        exit 1
      else
        echo ""
        echo "  All checks passed!"
        exit 0
      fi
    '';
  };

in
{
  inherit
    spotbugs
    nvdClojure
    kibit
    kondo
    eastwood
    all
    ;
}

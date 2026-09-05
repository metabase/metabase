# nix/security/default.nix
#
# Security test entry point. Imports all security checks and exposes them
# as an attribute set plus a combined runner.
#
# Attribute set:
#   ddlAudit       - Static DDL pattern audit (ripgrep, no DB)
#   securityTests  - Dynamic Clojure tests against real databases
#   all            - Runs all security checks sequentially
#
{
  pkgs,
  lib,
  src,
}:

let
  ddlAudit = import ./ddl-audit.nix { inherit pkgs src; };

  # TODO: Phase 2 — add security-backend.nix for dynamic Clojure tests
  # securityTests = import ./security-backend.nix { inherit pkgs; };

  all = pkgs.writeShellApplication {
    name = "mb-check-security-all";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      echo "========================================"
      echo "  Metabase Security Test Suite"
      echo "========================================"
      echo ""

      FAILED=""
      PASSED=""
      TOTAL_START=$(date +%s)

      run_check() {
        local name="$1"
        local script="$2"
        shift 2
        echo ""
        echo "── $name ──"
        START=$(date +%s)
        if "$script" "$@"; then
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

      # Tier 1: Static (fast, no DB)
      run_check "ddl-audit" "${ddlAudit}/bin/mb-check-ddl-audit"

      # Tier 2: Dynamic (needs PG + optionally Docker)
      # TODO: Phase 2 — add security-backend.nix

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
        echo "  All security checks passed!"
        exit 0
      fi
    '';
  };

in
{
  inherit ddlAudit all;
  # TODO: Phase 2
  # inherit securityTests;
}

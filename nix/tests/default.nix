# nix/tests/default.nix
#
# Test entry point. Returns all available test scripts.
#
{
  pkgs,
  lib,
  metabase,
}:

let
  healthCheck = import ./health-check.nix { inherit pkgs metabase; };
  apiSmoke = import ./api-smoke.nix { inherit pkgs metabase; };
  dbMigration = import ./db-migration.nix { inherit pkgs metabase; };
  ociLifecycle = import ./oci-lifecycle.nix { inherit pkgs lib; };

  all = pkgs.writeShellApplication {
    name = "mb-test-all";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      echo "========================================"
      echo "  Metabase Integration Tests"
      echo "========================================"
      echo ""

      FAILED=""
      PASSED=""
      TOTAL_START=$(date +%s)

      run_test() {
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

      run_test "health-check" "${healthCheck}/bin/mb-test-health-check"
      run_test "api-smoke" "${apiSmoke}/bin/mb-test-api-smoke"
      run_test "db-migration" "${dbMigration}/bin/mb-test-db-migration"

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
        echo "  All tests passed!"
        exit 0
      fi
    '';
  };

in
{
  health-check = healthCheck;
  api-smoke = apiSmoke;
  db-migration = dbMigration;
  oci-lifecycle = ociLifecycle.tests;
  inherit all;
}

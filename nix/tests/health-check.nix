# nix/tests/health-check.nix
#
# Integration test: Start PostgreSQL + Metabase, verify /api/health returns 200.
#
{ pkgs, metabase }:

let
  testLib = import ./lib.nix { inherit pkgs metabase; };
in
testLib.mkMetabaseTest {
  name = "mb-test-health-check";
  pgPort = 5433;
  mbPort = 3456;
  testBody = ''
    echo "PASS: Health check returned ok after $WAITED seconds"
  '';
}

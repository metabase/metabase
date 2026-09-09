# nix/tests/db-migration.nix
#
# Integration test: Verify Metabase creates expected database schema on first boot.
#
{ pkgs, metabase }:

let
  testLib = import ./lib.nix { inherit pkgs metabase; };
in
testLib.mkMetabaseTest {
  name = "mb-test-db-migration";
  pgPort = 5435;
  mbPort = 3458;
  testBody = ''
    echo "Checking database schema..."

    TABLES=$(psql -h "$PGSOCKET" -p 5435 metabase_test -t -c \
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" 2>/dev/null)

    EXPECTED_TABLES=("core_user" "report_card" "report_dashboard" "metabase_database")
    FOUND=0
    MISSING=""

    for table in "''${EXPECTED_TABLES[@]}"; do
      if echo "$TABLES" | grep -q "$table"; then
        FOUND=$((FOUND + 1))
      else
        MISSING="$MISSING $table"
      fi
    done

    echo "  Found $FOUND/''${#EXPECTED_TABLES[@]} expected tables"

    if [ -z "$MISSING" ]; then
      echo "PASS: All expected tables created by migration"
    else
      echo "FAIL: Missing tables:$MISSING"
      echo ""
      echo "Available tables:"
      echo "$TABLES" | head -30
      exit 1
    fi
  '';
}

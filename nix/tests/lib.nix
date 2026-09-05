# nix/tests/lib.nix
#
# Factory for Metabase integration test scripts.
# Handles PostgreSQL + Metabase setup/teardown boilerplate.
#
{ pkgs, metabase }:

{
  # mkMetabaseTest: creates a writeShellApplication that starts PostgreSQL and
  # Metabase, waits for health, then runs the test body.
  #
  # Args:
  #   name           - derivation name (e.g., "mb-test-health-check")
  #   pgPort         - PostgreSQL port (unique per test to allow parallel runs)
  #   mbPort         - Metabase Jetty port (unique per test)
  #   runtimeInputs  - additional packages beyond the base set
  #   testBody       - shell script body (runs after Metabase is healthy)
  #
  mkMetabaseTest =
    {
      name,
      pgPort,
      mbPort,
      runtimeInputs ? [ ],
      testBody,
    }:
    pkgs.writeShellApplication {
      inherit name;
      runtimeInputs = [
        pkgs.curl
        pkgs.postgresql_18
        pkgs.coreutils
      ]
      ++ runtimeInputs;
      text = ''
        echo "=== ${name} ==="
        echo ""

        PGDATA=$(mktemp -d)
        PGSOCKET=$(mktemp -d)
        MB_PORT=${toString mbPort}

        cleanup() {
          echo "Cleaning up..."
          kill "$MB_PID" 2>/dev/null || true
          pg_ctl -D "$PGDATA" stop 2>/dev/null || true
          rm -rf "$PGDATA" "$PGSOCKET"
        }
        trap cleanup EXIT

        # Start PostgreSQL
        echo "Starting PostgreSQL on port ${toString pgPort}..."
        initdb -D "$PGDATA" --no-locale --encoding=UTF8 > /dev/null
        {
          echo "unix_socket_directories = '$PGSOCKET'"
          echo "listen_addresses = 'localhost'"
          echo "port = ${toString pgPort}"
        } >> "$PGDATA/postgresql.conf"
        pg_ctl -D "$PGDATA" -l "$PGDATA/postgresql.log" start
        sleep 2
        createdb -h "$PGSOCKET" -p ${toString pgPort} metabase_test

        # Start Metabase
        echo "Starting Metabase on port $MB_PORT..."
        export MB_DB_TYPE=postgres
        export MB_DB_HOST=localhost
        export MB_DB_PORT=${toString pgPort}
        export MB_DB_DBNAME=metabase_test
        export MB_DB_USER="$USER"
        export MB_JETTY_PORT=$MB_PORT
        export MB_JETTY_HOST=localhost
        ${metabase}/bin/metabase &
        MB_PID=$!

        # Wait for health
        TIMEOUT=300
        WAITED=0
        while ! curl -sf "http://localhost:$MB_PORT/api/health" 2>/dev/null | grep -q ok; do
          sleep 2
          WAITED=$((WAITED + 2))
          if [ "$WAITED" -ge "$TIMEOUT" ]; then
            echo "FAIL: Metabase did not start after $TIMEOUT seconds"
            exit 1
          fi
          if ! kill -0 "$MB_PID" 2>/dev/null; then
            echo "FAIL: Metabase process died"
            exit 1
          fi
          if [ $((WAITED % 30)) -eq 0 ]; then
            echo "  Still waiting... ($WAITED/$TIMEOUT s)"
          fi
        done
        echo "Metabase healthy after $WAITED seconds."
        echo ""

        # Run test-specific body
        ${testBody}
      '';
    };
}

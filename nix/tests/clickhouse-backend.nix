# nix/tests/clickhouse-backend.nix
#
# ClickHouse backend test runner.
# Starts PostgreSQL (app DB) + ClickHouse (Docker), runs Clojure tests, tears down.
#
# Usage:
#   nix run .#tests-clickhouse-backend                     # all CH native tests
#   nix run .#tests-clickhouse-backend -- --only native    # native client tests only
#   nix run .#tests-clickhouse-backend -- --only parity    # parity tests only
#   nix run .#tests-clickhouse-backend -- --only unit      # unit tests only (no CH needed)
#   nix run .#tests-clickhouse-backend -- --only all-ch    # all clickhouse tests
#
{ pkgs }:

let
  pg = pkgs.postgresql_18;
  jdk = pkgs.temurin-bin-21;
  clojure = pkgs.clojure;
in
pkgs.writeShellApplication {
  name = "mb-test-clickhouse-backend";
  runtimeInputs = [
    pg
    jdk
    clojure
    pkgs.curl
    pkgs.coreutils
    pkgs.docker-client
  ];
  text = ''
    set -euo pipefail

    echo "=== ClickHouse Backend Tests ==="
    echo ""

    # ── Parse arguments ──────────────────────────────────────────────
    TEST_SET="native"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --only) TEST_SET="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
      esac
    done

    # ── Resolve test namespaces ──────────────────────────────────────
    case "$TEST_SET" in
      native)
        ONLY="[metabase.driver.clickhouse-native-test metabase.driver.clickhouse-native-parity-test]"
        NEEDS_CH=true
        ;;
      parity)
        ONLY="[metabase.driver.clickhouse-native-parity-test]"
        NEEDS_CH=true
        ;;
      unit)
        ONLY="[metabase.driver.clickhouse-native-test/param->sql-literal-basic-test metabase.driver.clickhouse-native-test/param->sql-literal-single-quote-test metabase.driver.clickhouse-native-test/param->sql-literal-backslash-escape-test metabase.driver.clickhouse-native-test/param->sql-literal-special-chars-test metabase.driver.clickhouse-native-test/param->sql-literal-date-types-test metabase.driver.clickhouse-native-test/substitute-params-basic-test metabase.driver.clickhouse-native-test/substitute-params-extra-params-test metabase.driver.clickhouse-native-test/substitute-params-exhausted-test metabase.driver.clickhouse-native-test/substitute-params-question-mark-in-string-literal-test metabase.driver.clickhouse-native-test/limit-detection-test metabase.driver.clickhouse-native-test/build-client-host-stripping-test]"
        NEEDS_CH=false
        ;;
      all-ch)
        ONLY="[metabase.driver.clickhouse-test metabase.driver.clickhouse-native-test metabase.driver.clickhouse-native-parity-test]"
        NEEDS_CH=true
        ;;
      *)
        echo "Unknown test set: $TEST_SET"
        echo "Options: native, parity, unit, all-ch"
        exit 1
        ;;
    esac

    echo "Test set: $TEST_SET"
    echo ""

    # ── Scratch directories ──────────────────────────────────────────
    PGDATA=$(mktemp -d)
    PGSOCKET=$(mktemp -d)
    PG_PORT=5434
    CH_CONTAINER=""

    cleanup() {
      echo ""
      echo "Cleaning up..."
      if [ -n "$CH_CONTAINER" ]; then
        docker rm -f "$CH_CONTAINER" 2>/dev/null || true
      fi
      pg_ctl -D "$PGDATA" stop 2>/dev/null || true
      rm -rf "$PGDATA" "$PGSOCKET"
    }
    trap cleanup EXIT

    # ── Start PostgreSQL (Metabase app DB) ───────────────────────────
    echo "Starting PostgreSQL on port $PG_PORT..."
    initdb -D "$PGDATA" --no-locale --encoding=UTF8 > /dev/null
    {
      echo "unix_socket_directories = '$PGSOCKET'"
      echo "listen_addresses = 'localhost'"
      echo "port = $PG_PORT"
    } >> "$PGDATA/postgresql.conf"
    pg_ctl -D "$PGDATA" -l "$PGDATA/postgresql.log" start
    sleep 1
    createdb -h "$PGSOCKET" -p "$PG_PORT" metabase_test

    # ── Start ClickHouse (if needed) ────────────────────────────────
    CH_PORT=8123
    if [ "$NEEDS_CH" = "true" ]; then
      if curl -sf "http://localhost:$CH_PORT/ping" > /dev/null 2>&1; then
        echo "ClickHouse already running on port $CH_PORT."
      else
        echo "Starting ClickHouse via Docker..."
        CH_CONTAINER=$(docker run -d --rm \
          --name "mb-test-ch-$$" \
          -p "$CH_PORT:8123" \
          -p 9000:9000 \
          clickhouse/clickhouse-server:25.2-alpine)
        echo "Waiting for ClickHouse..."
        for _i in $(seq 1 30); do
          if curl -sf "http://localhost:$CH_PORT/ping" > /dev/null 2>&1; then
            break
          fi
          sleep 1
        done
        if ! curl -sf "http://localhost:$CH_PORT/ping" > /dev/null 2>&1; then
          echo "FAIL: ClickHouse did not start in 30s"
          exit 1
        fi
        echo "ClickHouse ready."
      fi
    fi

    # ── Run Clojure tests ────────────────────────────────────────────
    echo ""
    echo "Running tests: $TEST_SET"
    echo ""

    export JAVA_HOME="${jdk}"
    export MB_DB_TYPE=postgres
    export MB_DB_HOST=localhost
    export MB_DB_PORT="$PG_PORT"
    export MB_DB_DBNAME=metabase_test
    export MB_DB_USER="$USER"
    export PGHOST="$PGSOCKET"
    export MB_CLICKHOUSE_TEST_HOST=localhost
    export MB_CLICKHOUSE_TEST_PORT="$CH_PORT"
    export DRIVERS=clickhouse
    export HAWK_MODE=cli/ci

    clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test \
      :only "$ONLY" \
      2>&1 \
      | grep -v '^Downloading: ' \
      | grep -v '^Reflection warning,' \
      | sed $'s/\033[\[(][0-9;]*[A-Za-z]//g; s/\033[^[]*//g'
  '';
}

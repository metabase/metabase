# nix/microvms/mkVm.nix
#
# NixOS test VM definition for Metabase lifecycle testing.
# Parameterized by architecture for multi-arch support.
#
{
  pkgs,
  lib,
  metabase,
  nixpkgs,
  arch,
  clickhouseDriver ? null,
  buildSystem ? "x86_64-linux",
}:

let
  constants = import ./constants.nix;
  cfg = constants.architectures.${arch};
  timeouts = constants.getTimeouts arch;

  # For the target system's packages
  targetPkgs = nixpkgs.legacyPackages.${cfg.nixSystem};
in
pkgs.testers.nixosTest {
  name = "metabase-lifecycle-${arch}";

  nodes.server =
    { config, pkgs, ... }:
    {
      # VM resources — extra RAM for ClickHouse + Metabase + PostgreSQL + 20K row benchmarks
      virtualisation.memorySize = 4096;
      virtualisation.cores = cfg.vcpu;

      # PostgreSQL for Metabase backend
      services.postgresql = {
        enable = true;
        package = pkgs.postgresql_18;
        initialScript = pkgs.writeText "metabase-init.sql" ''
          CREATE DATABASE metabase;
        '';
      };

      # ClickHouse for driver testing
      services.clickhouse = {
        enable = true;
      };

      # Metabase systemd service
      systemd.services.metabase = {
        description = "Metabase Application Server";
        after = [
          "postgresql.service"
          "clickhouse.service"
          "network.target"
        ];
        requires = [ "postgresql.service" ];
        wantedBy = [ "multi-user.target" ];

        environment = {
          MB_DB_TYPE = "postgres";
          MB_DB_DBNAME = "metabase";
          MB_DB_PORT = "5432";
          MB_DB_HOST = "localhost";
          MB_DB_USER = "metabase";
          MB_JETTY_HOST = "0.0.0.0";
          MB_JETTY_PORT = toString constants.metabasePort;
          MB_PLUGINS_DIR = "/var/lib/metabase/plugins";
          JAVA_OPTS = "-Xmx1g";
        };

        serviceConfig = {
          ExecStart = "${metabase}/bin/metabase";
          User = "metabase";
          Group = "metabase";
          StateDirectory = "metabase";
          WorkingDirectory = "/var/lib/metabase";
          Restart = "on-failure";
          RestartSec = 10;
          TimeoutStartSec = toString timeouts.metabaseStart;
        } // lib.optionalAttrs (clickhouseDriver != null) {
          ExecStartPre = "+${pkgs.writeShellScript "install-clickhouse-driver" ''
            mkdir -p /var/lib/metabase/plugins
            cp ${clickhouseDriver}/plugins/*.jar /var/lib/metabase/plugins/
            chown -R metabase:metabase /var/lib/metabase/plugins
          ''}";
        };
      };

      # Create metabase user for PostgreSQL
      users.users.metabase = {
        isSystemUser = true;
        group = "metabase";
      };
      users.groups.metabase = { };

      # PostgreSQL authentication for metabase user
      services.postgresql.authentication = lib.mkForce ''
        local all all trust
        host all all 127.0.0.1/32 trust
        host all all ::1/128 trust
      '';
      services.postgresql.ensureUsers = [
        {
          name = "metabase";
          ensureDBOwnership = true;
        }
      ];
      services.postgresql.ensureDatabases = [ "metabase" ];

      # Required packages for test assertions
      environment.systemPackages = [
        pkgs.curl
        pkgs.jq
      ];

      # Open firewall for Metabase
      networking.firewall.allowedTCPPorts = [ constants.metabasePort ];
    };

  # Test script (Python, NixOS test framework)
  #
  # Comprehensive application-layer verification:
  #   1. Service startup (PostgreSQL + ClickHouse + Metabase)
  #   2. Health check (/api/health)
  #   3. API smoke test (/api/session/properties → version)
  #   4. Database migration verification (core tables exist)
  #   5. Driver availability (built-in + clickhouse engines)
  #   6. Complete first-user setup via /api/setup
  #   7. Add PostgreSQL + ClickHouse as warehouse connections
  #   8. Timed SELECT 1 queries against both engines
  testScript = ''
    import json, time

    BASE = "http://localhost:${toString constants.metabasePort}"
    HAS_CLICKHOUSE = ${if clickhouseDriver != null then "True" else "False"}

    def timed_query(session_id, db_id, engine_name, query_sql, label, expect_rows=1, warmup=2, rounds=5):
        """Run a query multiple times and report timing statistics."""
        query_body = json.dumps({
            "database": db_id,
            "type": "native",
            "native": {"query": query_sql},
            "constraints": {"max-results": max(expect_rows + 100, 2000), "max-results-bare-rows": max(expect_rows + 100, 2000)}
        })
        # Write query body to a temp file to avoid shell quoting issues with large JSON
        server.succeed(f"cat > /tmp/query.json << 'QUERYEOF'\n{query_body}\nQUERYEOF")
        curl_cmd = (
            f"curl -sf -X POST {BASE}/api/dataset "
            f"-H 'Content-Type: application/json' "
            f"-H 'X-Metabase-Session: {session_id}' "
            f"-d @/tmp/query.json"
        )

        # Warmup rounds (discard results)
        for i in range(warmup):
            server.succeed(curl_cmd)

        # Timed rounds
        times_ms = []
        row_count = 0
        for i in range(rounds):
            t0 = time.monotonic()
            result = server.succeed(curl_cmd)
            t1 = time.monotonic()
            elapsed_ms = (t1 - t0) * 1000
            times_ms.append(elapsed_ms)
            qr = json.loads(result)
            assert qr.get("status") == "completed", f"Query failed: {qr.get('error', '?')}"
            row_count = qr.get("data", {}).get("row_count", len(qr.get("data", {}).get("rows", [])))
            assert row_count >= expect_rows, f"Expected >={expect_rows} rows, got {row_count}"

        avg_ms = sum(times_ms) / len(times_ms)
        min_ms = min(times_ms)
        max_ms = max(times_ms)
        print(f"PERF: {engine_name} {label} — avg: {avg_ms:.1f}ms, min: {min_ms:.1f}ms, max: {max_ms:.1f}ms ({rounds} rounds, {warmup} warmup, {row_count} rows)")
        return avg_ms

    server.start()
    server.wait_for_unit("postgresql.service")
    if HAS_CLICKHOUSE:
        server.wait_for_unit("clickhouse.service")
    server.wait_for_unit("metabase.service")
    server.wait_for_open_port(${toString constants.metabasePort})

    # ── 1. Health check ──
    for i in range(120):
        status, output = server.execute(f"curl -sf {BASE}/api/health")
        if status == 0 and "ok" in output:
            print(f"PASS: Metabase healthy after {i*2}s")
            break
        time.sleep(2)
    else:
        raise Exception("Metabase did not become healthy within 240s")

    # ── 2. API version ──
    result = server.succeed(f"curl -sf {BASE}/api/session/properties")
    props = json.loads(result)
    version = props.get("version", {}).get("tag", "")
    assert version, f"No version tag in session properties: {result[:200]}"
    print(f"PASS: API version: {version}")

    # ── 3. Database migration verification ──
    expected_tables = ["core_user", "report_card", "report_dashboard", "metabase_database"]
    for table in expected_tables:
        result = server.succeed(
            f"sudo -u metabase psql -d metabase -tAc \"SELECT COUNT(*) FROM information_schema.tables WHERE table_name='{table}'\""
        )
        count = result.strip()
        assert count == "1", f"Table {table} not found (count={count})"
        print(f"PASS: DB table '{table}' exists")

    # ── 4. Driver verification ──
    engines = props.get("engines", {})
    expected_engines = ["postgres", "h2"]
    if HAS_CLICKHOUSE:
        expected_engines.append("clickhouse")
    for engine in expected_engines:
        assert engine in engines, f"Engine '{engine}' not in available engines: {list(engines.keys())[:10]}"
        print(f"PASS: Engine '{engine}' available")

    # ── 5. Complete first-user setup ──
    setup_token = props.get("setup-token")
    assert setup_token, "No setup-token in session properties"
    print("PASS: Setup token obtained")

    setup_body = json.dumps({
        "token": setup_token,
        "prefs": {"site_name": "Metabase NixOS Test", "site_locale": "en"},
        "user": {
            "first_name": "Nix",
            "last_name": "Test",
            "email": "nix@test.local",
            "password": "NixTest123!"
        }
    })
    result = server.succeed(
        f"curl -sf -X POST {BASE}/api/setup "
        f"-H 'Content-Type: application/json' "
        f"-d '{setup_body}'"
    )
    session = json.loads(result)
    session_id = session.get("id", "")
    assert session_id, f"Setup did not return session ID: {result[:200]}"
    print(f"PASS: First-user setup complete (session: {session_id[:8]}...)")

    # ── 6. Add PostgreSQL as warehouse ──
    add_pg_body = json.dumps({
        "engine": "postgres",
        "name": "App DB (PostgreSQL)",
        "details": {
            "host": "localhost",
            "port": 5432,
            "dbname": "metabase",
            "user": "metabase"
        }
    })
    result = server.succeed(
        f"curl -sf -X POST {BASE}/api/database "
        f"-H 'Content-Type: application/json' "
        f"-H 'X-Metabase-Session: {session_id}' "
        f"-d '{add_pg_body}'"
    )
    pg_db = json.loads(result)
    pg_db_id = pg_db.get("id")
    assert pg_db_id, f"Failed to add PostgreSQL: {result[:300]}"
    print(f"PASS: PostgreSQL warehouse added (id={pg_db_id})")

    # ── 7. Add ClickHouse as warehouse (if driver available) ──
    ch_db_id = None
    if HAS_CLICKHOUSE:
        add_ch_body = json.dumps({
            "engine": "clickhouse",
            "name": "ClickHouse (test)",
            "details": {
                "host": "localhost",
                "port": 8123,
                "dbname": "default",
                "user": "default",
                "password": ""
            }
        })
        result = server.succeed(
            f"curl -sf -X POST {BASE}/api/database "
            f"-H 'Content-Type: application/json' "
            f"-H 'X-Metabase-Session: {session_id}' "
            f"-d '{add_ch_body}'"
        )
        ch_db = json.loads(result)
        ch_db_id = ch_db.get("id")
        assert ch_db_id, f"Failed to add ClickHouse: {result[:300]}"
        print(f"PASS: ClickHouse warehouse added (id={ch_db_id})")

    # ── 8. Query generators ──
    # Build wide-column SQL dynamically to avoid hand-writing 50/100-col queries.
    # Column types cycle: int, float, text, bool, hash (md5) — repeating pattern
    # that mimics real OLAP tables with mixed types.

    def make_pg_wide_query(ncols, nrows):
        """Generate a PostgreSQL wide-column query with mixed types."""
        cols = []
        for i in range(1, ncols + 1):
            mod = i % 5
            if mod == 1:   cols.append(f"x+{i} AS c{i}")                           # int
            elif mod == 2: cols.append(f"x*{i}.{i} AS c{i}")                        # float
            elif mod == 3: cols.append(f"CAST(x+{i} AS text) AS c{i}")              # text
            elif mod == 4: cols.append(f"(x%{i}=0) AS c{i}")                        # bool
            elif mod == 0: cols.append(f"md5(CAST(x+{i} AS text)) AS c{i}")         # hash
        return f"SELECT {', '.join(cols)} FROM generate_series(1, {nrows}) AS t(x)"

    def make_ch_wide_query(ncols, nrows):
        """Generate a ClickHouse wide-column query with mixed types."""
        cols = []
        for i in range(1, ncols + 1):
            mod = i % 5
            if mod == 1:   cols.append(f"number+{i} AS c{i}")                       # int
            elif mod == 2: cols.append(f"(number+1)*{i}.{i} AS c{i}")               # float
            elif mod == 3: cols.append(f"toString(number+{i}) AS c{i}")             # text
            elif mod == 4: cols.append(f"(number%{i}=0) AS c{i}")                   # bool
            elif mod == 0: cols.append(f"MD5(toString(number+{i})) AS c{i}")        # hash
        return f"SELECT {', '.join(cols)} FROM numbers({nrows})"

    def run_benchmark_suite(session_id, pg_db_id, ch_db_id, label_prefix=""):
        """Run the full column-scaling benchmark suite. Returns list of (label, ncols, pg_ms, ch_ms)."""
        results = []

        # SELECT 1 — minimal round-trip latency
        print("")
        print(f"--- {label_prefix}SELECT 1 (round-trip latency) ---")
        pg_s1 = timed_query(session_id, pg_db_id, "PostgreSQL", "SELECT 1 AS nix_test", f"{label_prefix}SELECT 1")
        ch_s1 = None
        if ch_db_id:
            ch_s1 = timed_query(session_id, ch_db_id, "ClickHouse", "SELECT 1 AS nix_test", f"{label_prefix}SELECT 1")
        results.append(("SELECT 1", 1, pg_s1, ch_s1))

        # 20K rows x 1 col — data transfer baseline
        print("")
        print(f"--- {label_prefix}SELECT 20K rows (data transfer) ---")
        pg_2k = timed_query(
            session_id, pg_db_id, "PostgreSQL",
            "SELECT x FROM generate_series(1, 20000) AS t(x)",
            f"{label_prefix}20K rows", expect_rows=20000, warmup=1, rounds=3
        )
        ch_2k = None
        if ch_db_id:
            ch_2k = timed_query(
                session_id, ch_db_id, "ClickHouse",
                "SELECT number + 1 AS x FROM numbers(20000)",
                f"{label_prefix}20K rows", expect_rows=20000, warmup=1, rounds=3
            )
        results.append(("1col x 20K", 1, pg_2k, ch_2k))

        # Aggregation query — computation without large data transfer
        print("")
        print(f"--- {label_prefix}SELECT SUM(1..100000) (computation) ---")
        pg_agg = timed_query(
            session_id, pg_db_id, "PostgreSQL",
            "SELECT SUM(x) FROM generate_series(1, 100000) AS t(x)",
            f"{label_prefix}SUM(100K)", expect_rows=1, warmup=1, rounds=3
        )
        ch_agg = None
        if ch_db_id:
            ch_agg = timed_query(
                session_id, ch_db_id, "ClickHouse",
                "SELECT sum(number + 1) FROM numbers(100000)",
                f"{label_prefix}SUM(100K)", expect_rows=1, warmup=1, rounds=3
            )
        results.append(("SUM(100K)", 1, pg_agg, ch_agg))

        # Column-scaling series: 6, 20, 50, 100 columns x 20K rows
        for ncols in [6, 20, 50, 100]:
            print("")
            print(f"--- {label_prefix}{ncols} cols x 20K rows (mixed types, column-scaling) ---")
            pg_ms = timed_query(
                session_id, pg_db_id, "PostgreSQL",
                make_pg_wide_query(ncols, 20000),
                f"{label_prefix}{ncols}col x 20K", expect_rows=20000, warmup=1, rounds=3
            )
            ch_ms = None
            if ch_db_id:
                ch_ms = timed_query(
                    session_id, ch_db_id, "ClickHouse",
                    make_ch_wide_query(ncols, 20000),
                    f"{label_prefix}{ncols}col x 20K", expect_rows=20000, warmup=1, rounds=3
                )
            results.append((f"{ncols}col x 20K", ncols, pg_ms, ch_ms))

        return results

    def print_summary_table(title, results):
        """Print a formatted summary table for benchmark results."""
        print("")
        print(f"=== {title} ===")
        print("PERF: SUMMARY_START")
        print(f"PERF: {'Query':<20} {'Cols':>4} {'PG (ms)':>10} {'CH (ms)':>10} {'CH/PG':>8} {'Overhead':>10}")
        print(f"PERF: {'-'*20} {'-'*4} {'-'*10} {'-'*10} {'-'*8} {'-'*10}")
        for label, ncols, pg_ms, ch_ms in results:
            if ch_ms is not None:
                ratio = ch_ms / pg_ms
                overhead = ch_ms - pg_ms
                print(f"PERF: {label:<20} {ncols:>4} {pg_ms:>10.1f} {ch_ms:>10.1f} {ratio:>7.2f}x {overhead:>+9.0f}ms")
            else:
                print(f"PERF: {label:<20} {ncols:>4} {pg_ms:>10.1f} {'N/A':>10} {'N/A':>8} {'N/A':>10}")
        print("PERF: SUMMARY_END")

    # ── 9. PASS 1: Benchmark with insights ENABLED (default) ──
    print("")
    print("=" * 70)
    print("=== PASS 1: Query Performance — insights ENABLED (default) ===")
    print("=" * 70)

    results_insights_on = run_benchmark_suite(session_id, pg_db_id, ch_db_id, label_prefix="[insights=ON] ")
    print_summary_table("Column-Scaling Summary — insights ENABLED", results_insights_on)

    # ── 10. Restart Metabase with insights DISABLED ──
    print("")
    print("=" * 70)
    print("=== Restarting Metabase with MB_LUDICROUS_SPEED=true ===")
    print("=" * 70)

    server.succeed("systemctl stop metabase.service")
    server.succeed("mkdir -p /etc/systemd/system/metabase.service.d")
    server.succeed(
        "cat > /etc/systemd/system/metabase.service.d/no-insights.conf << 'EOF'\n"
        "[Service]\n"
        "Environment=MB_LUDICROUS_SPEED=true\n"
        "EOF"
    )
    server.succeed("systemctl daemon-reload")
    server.succeed("systemctl start metabase.service")

    # Wait for Metabase to become healthy again (no migrations needed — fast restart)
    server.wait_for_open_port(${toString constants.metabasePort})
    for i in range(120):
        status, output = server.execute(f"curl -sf {BASE}/api/health")
        if status == 0 and "ok" in output:
            print(f"PASS: Metabase restarted (healthy after {i*2}s, insights DISABLED)")
            break
        time.sleep(2)
    else:
        raise Exception("Metabase did not become healthy after restart within 240s")

    # Re-authenticate (session invalidated by restart)
    login_body = json.dumps({"username": "nix@test.local", "password": "NixTest123!"})
    result = server.succeed(
        f"curl -sf -X POST {BASE}/api/session "
        f"-H 'Content-Type: application/json' "
        f"-d '{login_body}'"
    )
    login_resp = json.loads(result)
    session_id = login_resp.get("id", "")
    assert session_id, f"Re-login failed: {result[:200]}"
    print(f"PASS: Re-authenticated (session: {session_id[:8]}...)")

    # ── 11. PASS 2: Benchmark with insights DISABLED ──
    print("")
    print("=" * 70)
    print("=== PASS 2: Query Performance — insights DISABLED ===")
    print("=" * 70)

    results_insights_off = run_benchmark_suite(session_id, pg_db_id, ch_db_id, label_prefix="[insights=OFF] ")
    print_summary_table("Column-Scaling Summary — insights DISABLED", results_insights_off)

    # ── 12. Comparison table: insights ON vs OFF ──
    print("")
    print("=" * 70)
    print("=== COMPARISON: insights ON vs OFF (PostgreSQL) ===")
    print("=" * 70)
    print("PERF: COMPARISON_START")
    print(f"PERF: {'Query':<20} {'Cols':>4} {'ON (ms)':>10} {'OFF (ms)':>10} {'Speedup':>8} {'Saved':>10}")
    print(f"PERF: {'-'*20} {'-'*4} {'-'*10} {'-'*10} {'-'*8} {'-'*10}")
    for (label, ncols, on_pg, on_ch), (_, _, off_pg, off_ch) in zip(results_insights_on, results_insights_off):
        speedup = on_pg / off_pg if off_pg > 0 else 0
        saved = on_pg - off_pg
        print(f"PERF: {label:<20} {ncols:>4} {on_pg:>10.1f} {off_pg:>10.1f} {speedup:>7.2f}x {saved:>+9.0f}ms")
    print("PERF: COMPARISON_END")

    if ch_db_id:
        print("")
        print("=== COMPARISON: insights ON vs OFF (ClickHouse) ===")
        print("PERF: COMPARISON_CH_START")
        print(f"PERF: {'Query':<20} {'Cols':>4} {'ON (ms)':>10} {'OFF (ms)':>10} {'Speedup':>8} {'Saved':>10}")
        print(f"PERF: {'-'*20} {'-'*4} {'-'*10} {'-'*10} {'-'*8} {'-'*10}")
        for (label, ncols, on_pg, on_ch), (_, _, off_pg, off_ch) in zip(results_insights_on, results_insights_off):
            if on_ch is not None and off_ch is not None and off_ch > 0:
                speedup = on_ch / off_ch
                saved = on_ch - off_ch
                print(f"PERF: {label:<20} {ncols:>4} {on_ch:>10.1f} {off_ch:>10.1f} {speedup:>7.2f}x {saved:>+9.0f}ms")
        print("PERF: COMPARISON_CH_END")

    print("")
    print("PERF: Note — speedup from disabling insights-xform eliminates per-row hasheq overhead")
    print("PERF: See nix/performance-analysis.md for root cause analysis and remediation options")

    print("")
    print("All application-layer checks passed")
  '';
}

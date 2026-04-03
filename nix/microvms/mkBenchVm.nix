# nix/microvms/mkBenchVm.nix
#
# NixOS VM test that benchmarks multiple Metabase build variants
# side-by-side to demonstrate the performance impact of patches.
#
# Each variant is a Metabase package built with a different patch applied.
# The VM boots once, then for each variant:
#   1. Install the variant's JAR
#   2. Start Metabase
#   3. Run the column-scaling benchmark suite
#   4. Stop Metabase
#   5. Repeat with next variant
#
# Produces a comparison table showing the impact of each patch.
#
{
  pkgs,
  lib,
  nixpkgs,
  arch,
  clickhouseDriver ? null,
  buildSystem ? "x86_64-linux",

  # Ordered list of { name = "label"; package = <metabase derivation>; }
  # Order matters — first entry is the baseline.
  # Must be a list (not attrset) to preserve insertion order.
  variants,
}:

let
  constants = import ./constants.nix;
  cfg = constants.architectures.${arch};
  timeouts = constants.getTimeouts arch;
  targetPkgs = nixpkgs.legacyPackages.${cfg.nixSystem};

  variantNames = map (v: v.name) variants;

  # Create a directory with all variant JARs, each in its own subdirectory
  variantJars = pkgs.runCommand "bench-variant-jars" { } (
    ''
      mkdir -p $out
    ''
    + lib.concatStringsSep "\n" (
      map (
        v: ''
          mkdir -p $out/${v.name}
          cp ${v.package}/share/metabase/metabase.jar $out/${v.name}/metabase.jar
        ''
      ) variants
    )
  );
in
pkgs.testers.nixosTest {
  name = "metabase-bench-variants-${arch}";

  nodes.server =
    { config, pkgs, ... }:
    {
      virtualisation.memorySize = 4096;
      virtualisation.cores = cfg.vcpu;
      virtualisation.diskSize = 4096;  # 4GB — variant JAR copies + plugins + ClickHouse need space

      services.postgresql = {
        enable = true;
        package = pkgs.postgresql_18;
        initialScript = pkgs.writeText "metabase-init.sql" ''
          CREATE DATABASE metabase;
        '';
      };

      services.clickhouse = {
        enable = true;
      };

      # Metabase service — JAR path will be swapped per variant via symlink
      systemd.services.metabase = {
        description = "Metabase Application Server";
        after = [
          "postgresql.service"
          "clickhouse.service"
          "network.target"
        ];
        requires = [ "postgresql.service" ];

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
          ExecStart = "${targetPkgs.temurin-jre-bin-21}/bin/java -jar /var/lib/metabase/current/metabase.jar";
          User = "metabase";
          Group = "metabase";
          StateDirectory = "metabase";
          WorkingDirectory = "/var/lib/metabase";
          Restart = "no";
          TimeoutStartSec = toString timeouts.metabaseStart;
        } // lib.optionalAttrs (clickhouseDriver != null) {
          ExecStartPre = "+${pkgs.writeShellScript "install-clickhouse-driver" ''
            mkdir -p /var/lib/metabase/plugins
            cp ${clickhouseDriver}/plugins/*.jar /var/lib/metabase/plugins/
            chown -R metabase:metabase /var/lib/metabase/plugins
          ''}";
        };
      };

      users.users.metabase = {
        isSystemUser = true;
        group = "metabase";
      };
      users.groups.metabase = { };

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

      environment.systemPackages = [
        pkgs.curl
        pkgs.jq
      ];

      networking.firewall.allowedTCPPorts = [ constants.metabasePort ];
    };

  testScript = ''
    import json, time

    BASE = "http://localhost:${toString constants.metabasePort}"
    HAS_CLICKHOUSE = ${if clickhouseDriver != null then "True" else "False"}

    VARIANT_JARS = "${variantJars}"
    VARIANT_NAMES = ${builtins.toJSON variantNames}

    def timed_query(session_id, db_id, engine_name, query_sql, label, expect_rows=1, warmup=2, rounds=5):
        """Run a query multiple times and report timing statistics."""
        query_body = json.dumps({
            "database": db_id,
            "type": "native",
            "native": {"query": query_sql},
            "constraints": {"max-results": max(expect_rows + 100, 2000), "max-results-bare-rows": max(expect_rows + 100, 2000)}
        })
        server.succeed(f"cat > /tmp/query.json << 'QUERYEOF'\n{query_body}\nQUERYEOF")
        curl_cmd = (
            f"curl -sf -X POST {BASE}/api/dataset "
            "-H 'Content-Type: application/json' "
            f"-H 'X-Metabase-Session: {session_id}' "
            "-d @/tmp/query.json"
        )

        for i in range(warmup):
            server.succeed(curl_cmd)

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

    def make_pg_wide_query(ncols, nrows):
        cols = []
        for i in range(1, ncols + 1):
            mod = i % 5
            if mod == 1:   cols.append(f"x+{i} AS c{i}")
            elif mod == 2: cols.append(f"x*{i}.{i} AS c{i}")
            elif mod == 3: cols.append(f"CAST(x+{i} AS text) AS c{i}")
            elif mod == 4: cols.append(f"(x%{i}=0) AS c{i}")
            elif mod == 0: cols.append(f"md5(CAST(x+{i} AS text)) AS c{i}")
        return f"SELECT {', '.join(cols)} FROM generate_series(1, {nrows}) AS t(x)"

    def make_ch_wide_query(ncols, nrows):
        cols = []
        for i in range(1, ncols + 1):
            mod = i % 5
            if mod == 1:   cols.append(f"number+{i} AS c{i}")
            elif mod == 2: cols.append(f"(number+1)*{i}.{i} AS c{i}")
            elif mod == 3: cols.append(f"toString(number+{i}) AS c{i}")
            elif mod == 4: cols.append(f"(number%{i}=0) AS c{i}")
            elif mod == 0: cols.append(f"MD5(toString(number+{i})) AS c{i}")
        return f"SELECT {', '.join(cols)} FROM numbers({nrows})"

    def run_benchmark_suite(session_id, pg_db_id, ch_db_id, ch_native_db_id=None, label_prefix=""):
        """Run column-scaling benchmarks. Returns list of (label, ncols, pg_ms, ch_ms, ch_native_ms)."""
        results = []

        pg_s1 = timed_query(session_id, pg_db_id, "PG", "SELECT 1 AS nix_test", f"{label_prefix}SELECT 1")
        ch_s1 = timed_query(session_id, ch_db_id, "CH-JDBC", "SELECT 1 AS nix_test", f"{label_prefix}SELECT 1") if ch_db_id else None
        ch_nat_s1 = timed_query(session_id, ch_native_db_id, "CH-Native", "SELECT 1 AS nix_test", f"{label_prefix}SELECT 1") if ch_native_db_id else None
        results.append(("SELECT 1", 1, pg_s1, ch_s1, ch_nat_s1))

        pg_2k = timed_query(session_id, pg_db_id, "PG",
            "SELECT x FROM generate_series(1, 20000) AS t(x)",
            f"{label_prefix}1col x 20K", expect_rows=20000, warmup=1, rounds=3)
        ch_2k = timed_query(session_id, ch_db_id, "CH-JDBC",
            "SELECT number + 1 AS x FROM numbers(20000)",
            f"{label_prefix}1col x 20K", expect_rows=20000, warmup=1, rounds=3) if ch_db_id else None
        ch_nat_2k = timed_query(session_id, ch_native_db_id, "CH-Native",
            "SELECT number + 1 AS x FROM numbers(20000)",
            f"{label_prefix}1col x 20K", expect_rows=20000, warmup=1, rounds=3) if ch_native_db_id else None
        results.append(("1col x 20K", 1, pg_2k, ch_2k, ch_nat_2k))

        for ncols in [6, 20, 50, 100]:
            pg_ms = timed_query(session_id, pg_db_id, "PG",
                make_pg_wide_query(ncols, 20000),
                f"{label_prefix}{ncols}col x 20K", expect_rows=20000, warmup=1, rounds=3)
            ch_ms = timed_query(session_id, ch_db_id, "CH-JDBC",
                make_ch_wide_query(ncols, 20000),
                f"{label_prefix}{ncols}col x 20K", expect_rows=20000, warmup=1, rounds=3) if ch_db_id else None
            ch_nat_ms = timed_query(session_id, ch_native_db_id, "CH-Native",
                make_ch_wide_query(ncols, 20000),
                f"{label_prefix}{ncols}col x 20K", expect_rows=20000, warmup=1, rounds=3) if ch_native_db_id else None
            results.append((f"{ncols}col x 20K", ncols, pg_ms, ch_ms, ch_nat_ms))

        return results

    def wait_healthy(timeout_s=240):
        for i in range(timeout_s // 2):
            status, output = server.execute(f"curl -sf {BASE}/api/health")
            if status == 0 and "ok" in output:
                return i * 2
            time.sleep(2)
        raise Exception(f"Metabase not healthy within {timeout_s}s")

    def login():
        login_body = json.dumps({"username": "nix@test.local", "password": "NixTest123!"})
        result = server.succeed(
            f"curl -sf -X POST {BASE}/api/session "
            "-H 'Content-Type: application/json' "
            f"-d '{login_body}'"
        )
        resp = json.loads(result)
        sid = resp.get("id", "")
        assert sid, f"Login failed: {result[:200]}"
        return sid

    # ── Boot VM and wait for services ──
    server.start()
    server.wait_for_unit("postgresql.service")
    if HAS_CLICKHOUSE:
        server.wait_for_unit("clickhouse.service")

    # ── First variant: full setup (migrations, user creation, warehouses) ──
    first_variant = VARIANT_NAMES[0]
    print(f"Installing first variant: {first_variant}")
    server.succeed("mkdir -p /var/lib/metabase/current")
    server.succeed(f"cp {VARIANT_JARS}/{first_variant}/metabase.jar /var/lib/metabase/current/metabase.jar")
    server.succeed("chown -R metabase:metabase /var/lib/metabase")
    server.succeed("systemctl start metabase.service")
    server.wait_for_open_port(${toString constants.metabasePort})

    secs = wait_healthy()
    print(f"PASS: First variant '{first_variant}' healthy after {secs}s")

    # Get setup token and create first user
    result = server.succeed(f"curl -sf {BASE}/api/session/properties")
    props = json.loads(result)
    setup_token = props.get("setup-token")
    assert setup_token, "No setup-token"

    setup_body = json.dumps({
        "token": setup_token,
        "prefs": {"site_name": "Metabase Bench", "site_locale": "en"},
        "user": {
            "first_name": "Bench",
            "last_name": "Test",
            "email": "nix@test.local",
            "password": "NixTest123!"
        }
    })
    result = server.succeed(
        f"curl -sf -X POST {BASE}/api/setup "
        "-H 'Content-Type: application/json' "
        f"-d '{setup_body}'"
    )
    session = json.loads(result)
    session_id = session.get("id", "")
    assert session_id, f"Setup failed: {result[:200]}"
    print("PASS: First-user setup complete")

    # Add PostgreSQL warehouse
    add_pg_body = json.dumps({
        "engine": "postgres",
        "name": "App DB (PostgreSQL)",
        "details": {"host": "localhost", "port": 5432, "dbname": "metabase", "user": "metabase"}
    })
    result = server.succeed(
        f"curl -sf -X POST {BASE}/api/database "
        "-H 'Content-Type: application/json' "
        f"-H 'X-Metabase-Session: {session_id}' "
        f"-d '{add_pg_body}'"
    )
    pg_db_id = json.loads(result).get("id")
    assert pg_db_id, "Failed to add PostgreSQL"
    print(f"PASS: PostgreSQL warehouse (id={pg_db_id})")

    # Add ClickHouse warehouses (JDBC and Native Client V2)
    ch_db_id = None
    ch_native_db_id = None
    if HAS_CLICKHOUSE:
        # JDBC path (existing)
        add_ch_body = json.dumps({
            "engine": "clickhouse",
            "name": "ClickHouse JDBC",
            "details": {"host": "localhost", "port": 8123, "dbname": "default", "user": "default", "password": ""}
        })
        result = server.succeed(
            f"curl -sf -X POST {BASE}/api/database "
            "-H 'Content-Type: application/json' "
            f"-H 'X-Metabase-Session: {session_id}' "
            f"-d '{add_ch_body}'"
        )
        ch_db_id = json.loads(result).get("id")
        assert ch_db_id, "Failed to add ClickHouse JDBC"
        print(f"PASS: ClickHouse JDBC warehouse (id={ch_db_id})")

        # Client V2 native path (binary protocol, LZ4, connection pooling)
        add_ch_native_body = json.dumps({
            "engine": "clickhouse",
            "name": "ClickHouse Native",
            "details": {
                "host": "localhost", "port": 8123,
                "dbname": "default", "user": "default", "password": "",
                "use-native-client": True
            }
        })
        result = server.succeed(
            f"curl -sf -X POST {BASE}/api/database "
            "-H 'Content-Type: application/json' "
            f"-H 'X-Metabase-Session: {session_id}' "
            f"-d '{add_ch_native_body}'"
        )
        ch_native_db_id = json.loads(result).get("id")
        assert ch_native_db_id, "Failed to add ClickHouse Native"
        print(f"PASS: ClickHouse Native warehouse (id={ch_native_db_id})")

    # ── Benchmark each variant ──
    all_results = {}  # variant_name -> [(label, ncols, pg_ms, ch_ms, ch_native_ms), ...]

    for idx, variant_name in enumerate(VARIANT_NAMES):
        print("")
        print("=" * 70)
        print(f"=== VARIANT {idx+1}/{len(VARIANT_NAMES)}: {variant_name} ===")
        print("=" * 70)

        if idx > 0:
            # Stop, swap JAR, restart
            server.succeed("systemctl stop metabase.service")
            server.succeed(f"cp {VARIANT_JARS}/{variant_name}/metabase.jar /var/lib/metabase/current/metabase.jar")
            server.succeed("chown metabase:metabase /var/lib/metabase/current/metabase.jar")
            server.succeed("systemctl start metabase.service")
            server.wait_for_open_port(${toString constants.metabasePort})
            secs = wait_healthy()
            print(f"PASS: Variant '{variant_name}' healthy after {secs}s")
            session_id = login()
            print("PASS: Re-authenticated")

        results = run_benchmark_suite(session_id, pg_db_id, ch_db_id, ch_native_db_id, label_prefix=f"[{variant_name}] ")
        all_results[variant_name] = results

        # Print per-variant summary
        print("")
        print(f"=== Summary: {variant_name} ===")
        print(f"PERF: {'Query':<20} {'Cols':>4} {'PG':>10} {'CH-JDBC':>10} {'CH-Native':>10}")
        print(f"PERF: {'-'*20} {'-'*4} {'-'*10} {'-'*10} {'-'*10}")
        for label, ncols, pg_ms, ch_ms, ch_nat_ms in results:
            ch_str = f"{ch_ms:>10.1f}" if ch_ms is not None else f"{'N/A':>10}"
            cn_str = f"{ch_nat_ms:>10.1f}" if ch_nat_ms is not None else f"{'N/A':>10}"
            print(f"PERF: {label:<20} {ncols:>4} {pg_ms:>10.1f} {ch_str} {cn_str}")

    # ── Cross-variant comparison table ──
    print("")
    print("=" * 70)
    print("=== CROSS-VARIANT COMPARISON (PostgreSQL) ===")
    print("=" * 70)
    print("PERF: VARIANT_COMPARISON_START")

    baseline_name = VARIANT_NAMES[0]
    baseline_results = all_results[baseline_name]

    # Header
    header = f"PERF: {'Query':<16} {'Cols':>4}"
    for vn in VARIANT_NAMES:
        header += f"  {vn:>12}"
    if len(VARIANT_NAMES) > 1:
        for vn in VARIANT_NAMES[1:]:
            header += f"  {'vs ' + baseline_name:>12}"
    print(header)

    sep = f"PERF: {'-'*16} {'-'*4}"
    for _ in VARIANT_NAMES:
        sep += f"  {'-'*12}"
    if len(VARIANT_NAMES) > 1:
        for _ in VARIANT_NAMES[1:]:
            sep += f"  {'-'*12}"
    print(sep)

    # Data rows
    for row_idx in range(len(baseline_results)):
        label, ncols = baseline_results[row_idx][0], baseline_results[row_idx][1]
        line = f"PERF: {label:<16} {ncols:>4}"
        pg_values = []
        for vn in VARIANT_NAMES:
            pg_ms = all_results[vn][row_idx][2]
            pg_values.append(pg_ms)
            line += f"  {pg_ms:>10.1f}ms"
        if len(VARIANT_NAMES) > 1:
            base_pg = pg_values[0]
            for vi in range(1, len(VARIANT_NAMES)):
                if pg_values[vi] > 0 and base_pg > 0:
                    speedup = base_pg / pg_values[vi]
                    line += f"  {speedup:>10.2f}x"
                else:
                    line += f"  {'N/A':>12}"
        print(line)

    print("PERF: VARIANT_COMPARISON_END")

    # ClickHouse JDBC comparison if available
    if ch_db_id:
        print("")
        print("=== CROSS-VARIANT COMPARISON (ClickHouse JDBC) ===")
        print("PERF: VARIANT_COMPARISON_CH_JDBC_START")

        header = f"PERF: {'Query':<16} {'Cols':>4}"
        for vn in VARIANT_NAMES:
            header += f"  {vn:>12}"
        if len(VARIANT_NAMES) > 1:
            for vn in VARIANT_NAMES[1:]:
                header += f"  {'vs ' + baseline_name:>12}"
        print(header)
        print(sep)

        for row_idx in range(len(baseline_results)):
            label, ncols = baseline_results[row_idx][0], baseline_results[row_idx][1]
            line = f"PERF: {label:<16} {ncols:>4}"
            ch_values = []
            for vn in VARIANT_NAMES:
                ch_ms = all_results[vn][row_idx][3]
                if ch_ms is not None:
                    ch_values.append(ch_ms)
                    line += f"  {ch_ms:>10.1f}ms"
                else:
                    ch_values.append(0)
                    line += f"  {'N/A':>12}"
            if len(VARIANT_NAMES) > 1:
                base_ch = ch_values[0]
                for vi in range(1, len(VARIANT_NAMES)):
                    if ch_values[vi] > 0 and base_ch > 0:
                        speedup = base_ch / ch_values[vi]
                        line += f"  {speedup:>10.2f}x"
                    else:
                        line += f"  {'N/A':>12}"
            print(line)

        print("PERF: VARIANT_COMPARISON_CH_JDBC_END")

    # ClickHouse Native (Client V2) comparison if available
    if ch_native_db_id:
        print("")
        print("=== CROSS-VARIANT COMPARISON (ClickHouse Client V2 Native) ===")
        print("PERF: VARIANT_COMPARISON_CH_NATIVE_START")

        header = f"PERF: {'Query':<16} {'Cols':>4}"
        for vn in VARIANT_NAMES:
            header += f"  {vn:>12}"
        if len(VARIANT_NAMES) > 1:
            for vn in VARIANT_NAMES[1:]:
                header += f"  {'vs ' + baseline_name:>12}"
        print(header)
        print(sep)

        for row_idx in range(len(baseline_results)):
            label, ncols = baseline_results[row_idx][0], baseline_results[row_idx][1]
            line = f"PERF: {label:<16} {ncols:>4}"
            cn_values = []
            for vn in VARIANT_NAMES:
                cn_ms = all_results[vn][row_idx][4]
                if cn_ms is not None:
                    cn_values.append(cn_ms)
                    line += f"  {cn_ms:>10.1f}ms"
                else:
                    cn_values.append(0)
                    line += f"  {'N/A':>12}"
            if len(VARIANT_NAMES) > 1:
                base_cn = cn_values[0]
                for vi in range(1, len(VARIANT_NAMES)):
                    if cn_values[vi] > 0 and base_cn > 0:
                        speedup = base_cn / cn_values[vi]
                        line += f"  {speedup:>10.2f}x"
                    else:
                        line += f"  {'N/A':>12}"
            print(line)

        print("PERF: VARIANT_COMPARISON_CH_NATIVE_END")

    # Protocol comparison: JDBC vs Native for baseline variant
    if ch_db_id and ch_native_db_id:
        print("")
        print("=== PROTOCOL COMPARISON: CH-JDBC vs CH-Native (baseline variant) ===")
        print("PERF: PROTOCOL_COMPARISON_START")
        print(f"PERF: {'Query':<16} {'Cols':>4} {'CH-JDBC':>12} {'CH-Native':>12} {'Speedup':>10}")
        print(f"PERF: {'-'*16} {'-'*4} {'-'*12} {'-'*12} {'-'*10}")
        bl = all_results[baseline_name]
        for row_idx in range(len(bl)):
            label, ncols = bl[row_idx][0], bl[row_idx][1]
            ch_jdbc = bl[row_idx][3]
            ch_native = bl[row_idx][4]
            if ch_jdbc is not None and ch_native is not None and ch_native > 0:
                speedup = ch_jdbc / ch_native
                print(f"PERF: {label:<16} {ncols:>4} {ch_jdbc:>10.1f}ms {ch_native:>10.1f}ms {speedup:>8.2f}x")
            else:
                print(f"PERF: {label:<16} {ncols:>4} {'N/A':>12} {'N/A':>12} {'N/A':>10}")
        print("PERF: PROTOCOL_COMPARISON_END")

    print("")
    print("PERF: Variants benchmarked: " + ", ".join(VARIANT_NAMES))
    print("PERF: See nix/performance-analysis.md for root cause analysis")
    print("")
    print("All variant benchmarks completed")
  '';
}

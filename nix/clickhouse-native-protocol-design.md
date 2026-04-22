# ClickHouse Native Protocol Support — Design Document

## Problem

In our NixOS VM benchmarks, ClickHouse queries are consistently slower than PostgreSQL despite both databases being local (same VM, no network latency). At 6 columns x 20K rows, ClickHouse takes 573ms vs PostgreSQL's 545ms. At 20 columns the gap widens: 1454ms vs 1089ms.

This is surprising because ClickHouse is a columnar analytics database optimised for exactly this kind of read-heavy workload. The bottleneck isn't ClickHouse — it's the wire protocol.

## Root Cause

The Metabase ClickHouse driver communicates via **HTTP/JSON on port 8123**. PostgreSQL uses its **native binary wire protocol**. The difference matters:

| Aspect | PostgreSQL | ClickHouse (current) |
|--------|-----------|---------------------|
| Protocol | Native binary (port 5432) | HTTP/1.1 text (port 8123) |
| Serialisation | Binary, minimal overhead | JSON text, parse overhead |
| Connection | Persistent TCP | HTTP request/response per query |
| Compression | Optional zlib | Optional gzip (slower than LZ4) |

The [housepower/ClickHouse-Native-JDBC benchmarks](https://housepower.github.io/ClickHouse-Native-JDBC/dev/benchmark.html) show the native TCP protocol is **6-7x faster for SELECT** operations (188ms vs 1,228ms for 500K rows) compared to HTTP JDBC.

## Options Considered

### Option 1: housepower/ClickHouse-Native-JDBC

Third-party JDBC driver using native TCP protocol (port 9000).

| Aspect | Assessment |
|--------|-----------|
| Performance | 6-7x faster reads in benchmarks |
| API compatibility | Drop-in JDBC replacement (same ResultSet API) |
| Maintenance | Community project, last release June 2025 (v2.8.0) |
| Limitations | No ZSTD compression, no complex INSERT VALUES |
| Risk | Third-party; if abandoned, we're stuck |

### Option 2: Official ClickHouse Java Client V2 (RECOMMENDED)

Use the official `com.clickhouse:client-v2` library directly, bypassing JDBC for query execution. Reads results in RowBinary format (binary, efficient) over HTTP with connection pooling and LZ4 compression.

| Aspect | Assessment |
|--------|-----------|
| Performance | RowBinary is 18% faster than text JSON; LZ4 compression; connection pooling |
| API compatibility | Different API (GenericRecord, not ResultSet) — requires adapter code |
| Maintenance | Official ClickHouse project, actively developed, commercial backing |
| Limitations | HTTP only (no native TCP yet), but with binary format + pooling + LZ4 |
| Risk | Low — official client, same vendor as the database |

### Option 3: HTTP with RowBinaryWithNamesAndTypes format

Stay on JDBC but request binary response format. The JDBC v2 driver already uses RowBinaryWithNamesAndTypes internally for reads, so this may already be happening under the hood. Limited additional improvement possible.

### Decision: Option 2

The official ClickHouse Java Client V2 is the right path because:

1. **Long-term support** — maintained by ClickHouse Inc., the database vendor. If anything goes wrong, we can get help from the experts.
2. **Binary format** — RowBinary avoids JSON text serialisation overhead. Data arrives in a compact binary representation.
3. **Connection pooling** — built-in Apache HttpClient5 pooling (default 10 connections) amortises HTTP overhead across queries.
4. **LZ4 compression** — faster than gzip, reduces data transfer even on localhost.
5. **Streaming reads** — `query()` returns an InputStream-backed reader, enabling row-by-row streaming without loading entire result sets into memory.
6. **Future-proof** — when ClickHouse adds native TCP to the Java client (planned per [issue #1644](https://github.com/ClickHouse/clickhouse-java/issues/1644)), we get it for free.

The trade-off is that we need an adapter layer between the Client V2 `GenericRecord` API and Metabase's `sql-jdbc` infrastructure. But the refactoring to separate JDBC-specific code from protocol-agnostic code is beneficial regardless.

## Current Driver Architecture

```
modules/drivers/clickhouse/src/metabase/driver/
├── clickhouse.clj              # Entry point: connection, DDL, features, workspace
├── clickhouse_introspection.clj # Schema/table/column discovery via JDBC metadata
├── clickhouse_qp.clj           # Query processor: SQL generation + JDBC ResultSet reading
├── clickhouse_version.clj      # Version detection (queries via JDBC)
└── clickhouse_nippy.clj        # Serialisation for unsigned integer types
```

### JDBC coupling analysis

| File | JDBC-specific | Protocol-agnostic |
|------|--------------|-------------------|
| `clickhouse.clj` | ~60% (connection, DDL, insert, workspace) | ~40% (features, type mapping, SQL generation) |
| `clickhouse_qp.clj` | ~25% (10 `read-column-thunk` methods, lines 502-612) | ~75% (HoneySQL generation, date handling, 49 expression methods) |
| `clickhouse_introspection.clj` | ~40% (JDBC DatabaseMetaData calls) | ~60% (type normalisation, filtering logic) |
| `clickhouse_version.clj` | ~100% (executes SQL via JDBC) | — |
| `clickhouse_nippy.clj` | 0% | 100% (pure serialisation) |

The key insight: **most of `clickhouse_qp.clj` is pure SQL generation** (HoneySQL expressions, date handling, type coercion). Only the `read-column-thunk` methods (~110 lines) are JDBC-specific. This is the code that reads each column from a `java.sql.ResultSet` — it's the hot path for query results.

## Proposed Architecture

### File structure

```
modules/drivers/clickhouse/src/metabase/driver/
├── clickhouse.clj                  # Entry point: feature flags, routing, config
├── clickhouse_qp.clj              # SQL generation (HoneySQL) — UNCHANGED, protocol-agnostic
├── clickhouse_jdbc.clj            # JDBC transport: connection, ResultSet reading, DDL
├── clickhouse_native.clj          # Client V2 transport: query execution, GenericRecord reading
├── clickhouse_introspection.clj   # Schema discovery (stays JDBC — metadata API only)
├── clickhouse_version.clj         # Version detection (stays JDBC — lightweight)
└── clickhouse_nippy.clj           # Serialisation — UNCHANGED
```

### What goes where

**`clickhouse.clj`** (entry point — refactored)
- Driver registration, feature flags, display name
- Type mappings (`type->database-type`, `upload-type->database-type`)
- Error message handling
- **New**: Configuration option for protocol selection
- **New**: Routing logic that delegates to `clickhouse_jdbc` or `clickhouse_native` based on config

**`clickhouse_qp.clj`** (SQL generation — mostly unchanged)
- All 49 `sql.qp/->honeysql` methods stay here
- All 18 `sql.qp/date` methods stay here
- Date/time handling, arithmetic, string functions — all stay
- **Moved out**: `read-column-thunk` methods (lines 502-612) → `clickhouse_jdbc.clj`

**`clickhouse_jdbc.clj`** (new — JDBC transport layer)
- `connection-details->spec` (from `clickhouse.clj`)
- `do-with-connection-with-options` (from `clickhouse.clj`)
- `read-column-thunk` methods (from `clickhouse_qp.clj`)
- `set-parameter` overrides (from `clickhouse.clj`)
- DDL operations: `create-table!`, `rename-table!`, `insert-into!`
- Workspace isolation: `init-workspace-isolation!`, `grant-workspace-read-access!`, `destroy-workspace-isolation!`
- `can-connect?` (JDBC version)

**`clickhouse_native.clj`** (new — Client V2 transport layer)
- Client V2 connection management (builder pattern, connection pooling)
- Query execution via `client.query()` with streaming RowBinary reader
- Column reading from `GenericRecord` (equivalent to `read-column-thunk` but for Client V2)
- Connection test via Client V2 API
- **Does NOT handle**: DDL, workspace isolation, schema introspection — these stay on JDBC (they're infrequent, metadata operations where HTTP overhead is irrelevant)

### Configuration

Add a new connection detail field to the ClickHouse database configuration:

```clojure
;; In the database connection details map:
{:host "localhost"
 :port 8123          ; HTTP port (used by both protocols for now)
 :dbname "default"
 :user "default"
 :password ""
 :use-native-client true}  ; NEW — opt-in to Client V2 for queries
```

The setting appears in the Metabase Admin UI as a toggle: **"Use optimised binary protocol (recommended)"**.

When enabled:
- **Query execution** (`/api/dataset`, dashboard cards) uses Client V2 with RowBinary
- **Schema introspection** (`/api/database/sync`) still uses JDBC (for DatabaseMetaData API)
- **DDL operations** (uploads, workspace isolation) still use JDBC
- **Version detection** still uses JDBC

This means the JDBC driver is always loaded (for metadata/DDL), but the hot path (query results) goes through the faster Client V2 channel.

### Routing logic

In `clickhouse.clj`:

```clojure
(defn use-native-client?
  "Returns true if the database is configured to use the Client V2 binary protocol."
  [database]
  (get-in database [:details :use-native-client] false))

;; For query execution, delegate to the appropriate transport:
(defmethod sql-jdbc.execute/do-with-connection-with-options :clickhouse
  [driver db-or-id-or-spec options f]
  (if (and (not (:write? options))        ; reads only
           (use-native-client? db-or-id-or-spec))
    (clickhouse-native/do-with-native-query driver db-or-id-or-spec options f)
    (clickhouse-jdbc/do-with-jdbc-connection driver db-or-id-or-spec options f)))
```

### Client V2 query execution

In `clickhouse_native.clj`:

```clojure
(defn execute-query
  "Execute a query using the ClickHouse Client V2 and return results
   as a lazy sequence of row vectors (matching Metabase's expected format)."
  [client sql params]
  (let [response (.query client sql)
        reader   (.newBinaryFormatReader client response)]
    ;; Returns a reducible that streams rows without loading all into memory
    (reify clojure.lang.IReduceInit
      (reduce [_ f init]
        (loop [acc init]
          (if (.hasNext reader)
            (do (.next reader)
                (let [row (read-row reader)]  ; GenericRecord → vector
                  (recur (f acc row))))
            acc))))))
```

The `read-row` function maps `GenericRecord` getters to Clojure types, equivalent to the `read-column-thunk` methods in the JDBC path but using the Client V2 API:

```clojure
(defn- read-row
  "Read a single row from a ClickHouse BinaryFormatReader into a vector."
  [^ClickHouseBinaryFormatReader reader]
  (let [col-count (.getColumnCount reader)]
    (mapv (fn [i]
            (let [col-type (.getColumnTypeName reader (inc i))]
              (read-column reader (inc i) col-type)))
          (range col-count))))

(defmulti read-column
  "Read a single column value from a ClickHouse BinaryFormatReader."
  (fn [_reader _index col-type] (normalise-type col-type)))

(defmethod read-column "Int32"    [r i _] (.getInteger r i))
(defmethod read-column "String"   [r i _] (.getString r i))
(defmethod read-column "Float64"  [r i _] (.getDouble r i))
(defmethod read-column "DateTime" [r i _] (.getLocalDateTime r i))
;; ... etc, mirroring the JDBC read-column-thunk methods
```

### Dependencies

Add to `modules/drivers/clickhouse/deps.edn`:

```edn
{:deps
 {com.clickhouse/clickhouse-jdbc    {:mvn/version "0.9.7"
                                     :exclusions [org.apache.commons/commons-lang3]}
  com.clickhouse/client-v2          {:mvn/version "0.9.7"}   ; NEW
  org.lz4/lz4-java                  {:mvn/version "1.8.0"}}}
```

Both artifacts are from the same `clickhouse-java` monorepo, so they share internal classes and are version-compatible.

## Migration Path

### Phase 1: Refactor (no behaviour change)

1. Create `clickhouse_jdbc.clj` — move JDBC-specific code from `clickhouse.clj` and `clickhouse_qp.clj`
2. Verify all existing tests pass with the refactored structure
3. No new dependencies, no new features

### Phase 2: Add Client V2 transport

1. Add `com.clickhouse/client-v2` dependency
2. Create `clickhouse_native.clj` with Client V2 query execution
3. Add `use-native-client` connection detail toggle
4. Add routing logic in `clickhouse.clj`
5. Integration tests comparing JDBC vs Client V2 results

### Phase 3: Benchmark and validate

#### Nix variant benchmarks

Extend the existing variant benchmark framework (`nix/microvms/mkBenchVm.nix`) with a new variant that enables the Client V2 transport for ClickHouse queries. The key difference from the `no-insights` / `skip-dash` variants is that this one doesn't patch the uberjar — it patches the **driver JAR** and changes a **runtime database configuration**.

**New variant**: `ch-native`

| Variant | What changes | Patch target |
|---------|-------------|-------------|
| `vanilla` | Nothing (baseline) | — |
| `no-insights` | Skip insights-xform | uberjar |
| `skip-dash` | Skip insights for dashboards | uberjar |
| `ch-native` | ClickHouse Client V2 transport | clickhouse driver JAR + runtime DB config |

**Implementation approach**:

1. **New patch**: `nix/patches/clickhouse-native-client.patch` — applies to the ClickHouse driver source tree, adding the `clickhouse_native.clj` transport and modifying `clickhouse.clj` to route based on a connection detail flag.

2. **Variant driver build**: Use `mkVariant` (or a new `mkDriverVariant`) to build a patched clickhouse driver JAR with the Client V2 dependency added.

3. **VM test changes**: After installing the variant JAR and starting Metabase, the benchmark script must also **update the ClickHouse database connection** to set `use-native-client: true`:

```python
# After Metabase boots with the ch-native variant, update the CH warehouse config
update_body = json.dumps({
    "details": {
        "host": "localhost", "port": 8123,
        "dbname": "default", "user": "default", "password": "",
        "use-native-client": True
    }
})
server.succeed(
    f"curl -sf -X PUT {BASE}/api/database/{ch_db_id} "
    "-H 'Content-Type: application/json' "
    f"-H 'X-Metabase-Session: {session_id}' "
    f"-d '{update_body}'"
)
```

4. **Comparison table**: The cross-variant comparison already separates PG and CH columns. With `ch-native`, we get a direct apples-to-apples comparison:

```
PERF: Query         Cols    CH-JDBC    CH-Native   vs JDBC
PERF: 6col x 20K      6     573ms      ~400ms?     ~1.4x?
PERF: 20col x 20K    20    1454ms      ~950ms?     ~1.5x?
```

#### Correctness validation

Before benchmarking, the test must verify that Client V2 returns **identical results** to JDBC:

```python
# Run the same query through both paths, compare row counts and checksums
for ncols in [1, 6, 20]:
    query = make_ch_wide_query(ncols, 100)  # small dataset for correctness
    jdbc_result = run_query(session_id, ch_db_id_jdbc, query)
    native_result = run_query(session_id, ch_db_id_native, query)
    assert jdbc_result["row_count"] == native_result["row_count"]
    assert jdbc_result["data"]["rows"] == native_result["data"]["rows"]
```

This can be done by adding the ClickHouse warehouse **twice** — once with `use-native-client: false` and once with `use-native-client: true` — so both paths are available in the same Metabase instance.

#### Combined benchmark matrix

The full benchmark matrix after this work will be:

| Variant | Insights | CH Protocol | What it measures |
|---------|----------|-------------|-----------------|
| `vanilla` | ON | JDBC/HTTP | Current baseline |
| `no-insights` | OFF | JDBC/HTTP | Insights overhead (Metabase core) |
| `ch-native` | ON | Client V2/RowBinary | Protocol overhead (ClickHouse wire) |
| `ch-native-no-insights` | OFF | Client V2/RowBinary | Both optimisations combined |

The last variant (`ch-native-no-insights`) is the most interesting — it shows the maximum achievable improvement from both optimisations stacked. If vanilla takes 1454ms at 20col and this takes ~350ms, that's a **4x improvement** from two independent, non-invasive changes.

#### Nix build integration

```nix
# In flake.nix, add to the variants list:
{ name = "ch-native";             package = variantChNative; }
{ name = "ch-native-no-insights"; package = variantChNativeNoInsights; }
```

Where `variantChNative` applies the clickhouse-native-client patch to the driver, and `variantChNativeNoInsights` applies both the driver patch and the `skip-insights-all.patch` to the uberjar.

This reuses the existing `mkBenchVm.nix` infrastructure — same VM, same benchmark suite, same comparison table format. The only addition is that after swapping JARs for a `ch-native` variant, the script also updates the ClickHouse database connection details via the API.

### Phase 4: Consider native TCP (future)

When the official ClickHouse Java client adds native TCP support (per [issue #1644](https://github.com/ClickHouse/clickhouse-java/issues/1644)), the Client V2 path gets it automatically — no Metabase code changes needed. At that point, the architecture supports three transports:

```
clickhouse.clj (router)
  ├── clickhouse_jdbc.clj       (JDBC over HTTP — legacy, always available)
  ├── clickhouse_native.clj     (Client V2 over HTTP — binary format, pooled)
  └── (future) Client V2 over native TCP — zero-change upgrade
```

## Compatibility Notes

- **Existing users**: No change. Default is `use-native-client: false`. HTTP JDBC path continues to work exactly as before.
- **Firewall rules**: JDBC path uses port 8123 (HTTP). Client V2 also uses port 8123 (HTTP). No new ports needed. When native TCP arrives, it would use port 9000, but that would be an additional opt-in.
- **ODBC users**: Unaffected. ODBC is a separate connection path not managed by this driver.
- **Schema sync / metadata**: Always uses JDBC. The `DatabaseMetaData` API has no equivalent in Client V2.
- **Uploads / DDL**: Always uses JDBC. These are write operations where HTTP overhead is negligible.

## Expected Performance Improvement

Based on ClickHouse's own benchmarks:
- **RowBinary** is ~18% faster than text formats for reads
- **LZ4 compression** reduces transfer size significantly (even on localhost, it reduces memory allocation)
- **Connection pooling** eliminates per-query HTTP connection overhead
- **Combined**: estimated 30-50% improvement for query reads, bringing ClickHouse closer to PostgreSQL performance in our benchmarks

For native TCP (future): **6-7x improvement** based on housepower benchmarks.

## Key Source Files Referenced

| File | Lines | What |
|------|-------|------|
| `modules/drivers/clickhouse/src/metabase/driver/clickhouse.clj` | 78-139 | JDBC connection + spec building |
| `modules/drivers/clickhouse/src/metabase/driver/clickhouse_qp.clj` | 502-612 | JDBC `read-column-thunk` methods (hot path) |
| `modules/drivers/clickhouse/src/metabase/driver/clickhouse_introspection.clj` | 107-161 | JDBC metadata introspection |
| `modules/drivers/clickhouse/deps.edn` | — | Current dependencies |
| `src/metabase/driver/sql_jdbc/execute.clj` | — | Metabase's JDBC execution framework |

## Sources

- [ClickHouse Native JDBC Benchmarks](https://housepower.github.io/ClickHouse-Native-JDBC/dev/benchmark.html) — 6-7x faster reads with native TCP
- [ClickHouse Java Client V2 Docs](https://clickhouse.com/docs/integrations/language-clients/java/client) — official Client V2 API
- [ClickHouse Input Format Benchmarks](https://clickhouse.com/blog/clickhouse-input-format-matchup-which-is-fastest-most-efficient) — RowBinary vs Native vs text formats
- [Native TCP Protocol Status](https://github.com/ClickHouse/clickhouse-java/issues/1644) — planned but not yet available
- [Client V2 Architecture](https://deepwiki.com/ClickHouse/clickhouse-java/4.1-client-v2-(current)) — HTTP pooling, binary format details
- [HTTP Interface Overhead](https://github.com/ClickHouse/ClickHouse/issues/32958) — server-side CPU overhead of HTTP vs native

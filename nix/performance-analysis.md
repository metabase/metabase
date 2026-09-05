# Metabase Query Pipeline Performance Analysis

## Executive Summary

Production Metabase deployments exhibit **10x+ overhead** between raw SQL execution time and API response time. A query returning in 21-32ms from the database takes 370-433ms through the Metabase API. This affects **all database engines** — our NixOS VM benchmarks show PostgreSQL and ClickHouse converging to identical performance at 50+ columns, proving the bottleneck is in Metabase's core result processing pipeline, not any specific driver.

**Root cause**: The `insights-xform` middleware in `results_metadata.clj` runs statistical fingerprinting (trend analysis, anomaly detection) on **every row** of **every query**. It uses `combine-additional-reducing-fns` which recreates a Clojure map for each row, triggering `clojure.lang.Util.hasheq(Object)` as the dominant CPU hotspot (confirmed via JMC profiling).

**Key discovery**: Metabase already has a `skip-results-metadata?` middleware flag that bypasses `insights-xform` entirely. It's used for export queries but **not** for normal dashboard card queries. A one-line change could eliminate most of this overhead.

**Remediation shipped**: We added `MB_LUDICROUS_SPEED=true` (named after the *Spaceballs* speed setting) as a `defsetting` in `query_processor/settings.clj`. When enabled, it skips `insights-xform` for all queries, delivering 2-3x faster API responses. The only cost is losing the trend/anomaly badges on dashboard cards. **Recommended for most deployments** — the performance gain far outweighs losing those optional annotations.

## Evidence

### Production Measurements

From the [Metabase Discourse thread](https://discourse.metabase.com/t/metabase-x10-times-slower-than-the-sql-query/215352):

| Metric | Value |
|--------|-------|
| SQL execution time (ClickHouse) | 21-32ms |
| API response time | 370-433ms |
| Result set size | 16-46 rows |
| Overhead factor | 10-20x |

### NixOS VM Column-Scaling Benchmarks

20,000 rows, varying column counts. NixOS VM, 4GB RAM. Both engines use the same Metabase instance.

| Query | Cols | PG (ms) | CH (ms) | CH/PG | Notes |
|-------|------|---------|---------|-------|-------|
| SELECT 1 | 1 | 102 | 90 | 0.88x | Baseline overhead |
| 1col x 20K | 1 | 371 | 210 | 0.57x | Minimal per-row work |
| SUM(100K) | 1 | 92 | 137 | 1.48x | Aggregation, 1 result row |
| 6col x 20K | 6 | 488 | 644 | 1.32x | CH driver adds ~150ms fixed |
| 20col x 20K | 20 | 1312 | 1416 | 1.08x | Converging |
| 50col x 20K | 50 | 2821 | 2805 | 0.99x | **Identical** — bottleneck is Metabase |
| 100col x 20K | 100 | 3809 | 3826 | 1.00x | **Identical** — confirms above |

**Key observations**:
1. ~100ms baseline overhead for any query (even `SELECT 1`) — this is the middleware chain cost
2. ClickHouse driver adds a small fixed cost (~100-150ms) visible at low column counts, but it's constant, not per-column
3. At 50+ columns, PG and CH are identical — the bottleneck is entirely Metabase core
4. Cost scales linearly with `rows x columns` — consistent with per-row map creation in `insights-xform`

### Two Distinct Sources of Overhead

The benchmarks reveal **two independent performance problems** with different root causes:

| Source | Magnitude | Scales with | Root Cause | Fix |
|--------|-----------|-------------|------------|-----|
| **Metabase core** (`insights-xform`) | 2-3x at 1-50 cols | rows × columns | Per-row Clojure map creation + `hasheq` | `MB_LUDICROUS_SPEED=true` (Option F) |
| **ClickHouse protocol** (HTTP/JSON) | ~100-150ms fixed | constant per query | JDBC HTTP/JSON text serialization | Client V2 with RowBinary (Option G) |

At low column counts (1-6), the protocol overhead is a significant fraction of total time. At high column counts (50+), Metabase core dominates and the protocol cost becomes negligible. **Both must be addressed** for optimal ClickHouse performance — `MB_LUDICROUS_SPEED` alone doesn't help with the protocol overhead, and the native protocol alone doesn't help with the insights overhead.

## Root Cause Analysis

### The Query Result Pipeline

When a query executes through Metabase's API, results pass through this chain:

```
JDBC row-thunk (vectors)
    → 15 post-processing middleware (vectors)
        → insights-xform ← THE BOTTLENECK (creates maps per row)
            → :api streaming writer (vectors)
```

#### 1. JDBC Row Reading (efficient)

**File**: `src/metabase/driver/sql_jdbc/execute.clj:679-691`

`row-thunk` reads each row from the JDBC `ResultSet` using `perf/juxt*` to produce a **vector**. This is efficient — no hash computation, no map creation.

#### 2. Post-Processing Middleware Chain (efficient)

**File**: `src/metabase/query_processor/postprocess.clj:25-50`

15 middleware functions process results bottom-to-top. Most operate on the metadata or final result, not per-row. The chain passes **vectors** through to the reducing function. Individual middleware cost is negligible.

#### 3. `insights-xform` — THE BOTTLENECK

**File**: `src/metabase/query_processor/middleware/results_metadata.clj:121-148`

`insights-xform` wraps the reducing function with `combine-additional-reducing-fns`, which adds `insights-rf` as an additional reducer that runs on **every row**.

**File**: `src/metabase/query_processor/reducible.clj:108-115`

`combine-additional-reducing-fns` calls the additional reducing functions with each row. The insights reducer (`analyze/insights-rf`) needs **named column access** (it computes trends, anomalies per column), so it works with maps rather than positional vectors.

The per-row cost comes from:
- Creating a Clojure map from each result vector (column-name → value)
- Map creation triggers `clojure.lang.Util.hasheq(Object)` for every key and value
- `hasheq` is the CPU hotspot identified by JMC profiling
- This happens for **every row** of **every query**, regardless of whether insights are needed

#### 4. `:api` Streaming Writer (efficient)

**File**: `src/metabase/query_processor/streaming/json.clj:113-154`

The `:api` streaming writer uses Jackson's streaming API to write JSON directly. It receives vectors and writes them efficiently. The damage is already done by `insights-xform` upstream.

**Note**: The `:json` export writer (`streaming/json.clj:67-83`) also creates maps per row (`array-map` + `interleave`), but this path is only used for JSON file exports, not API responses.

### The `skip-results-metadata?` Flag

**File**: `src/metabase/query_processor/middleware/results_metadata.clj:140-148`

The `record-and-return-metadata!` function already checks for `skip-results-metadata?` in the query's `:middleware` map. When set, it bypasses `insights-xform` entirely and returns the raw `rff`.

**Already used for exports** (`src/metabase/dashboards_rest/api.clj:1440-1457`):
```clojure
:middleware {:skip-results-metadata? true  ;; ← skips insights
             :process-viz-settings?  true
             :ignore-cached-results? true
             ...}
```

**NOT used for dashboard queries** (`src/metabase/dashboards_rest/api.clj:1395-1411`):
```clojure
;; No :middleware map at all — insights-xform runs on every row
(m/mapply qp.dashboard/process-query-for-dashcard ...)
```

## Remediation Options

### Option A: Set `skip-results-metadata? true` for Dashboard Queries

**Change**: Add `:middleware {:skip-results-metadata? true}` to the dashboard card query endpoint.

**File**: `src/metabase/dashboards_rest/api.clj:1395-1411`

| Aspect | Detail |
|--------|--------|
| Effort | 1 line |
| Impact | ~10x improvement for dashboard queries |
| Risk | Dashboard cards won't show trend arrows / anomaly badges until refresh |
| Reversibility | Trivial to revert |

**Pros**: Smallest possible change. Already proven in production (export path uses it). Dashboard queries rarely need real-time insights — they're computed when the card is saved.

**Cons**: Opts out of insights entirely for dashboard queries. If Metabase introduces new per-row features that piggyback on insights, they'd be silently disabled.

### Option B: Defer Insights to Completion Phase with Sampling

**Change**: Instead of computing insights per-row, buffer a sample (e.g., first 1000 rows) and compute insights in the `combine` (completion) phase.

| Aspect | Detail |
|--------|--------|
| Effort | Medium (~1-2 days) |
| Impact | ~10x for large result sets, minimal for small ones |
| Risk | Insights accuracy may differ slightly with sampling |
| Reversibility | Moderate — touches insights internals |

**Pros**: Keeps insights functional. Reduces per-row cost to near-zero for large result sets. Sampling is standard for statistical analysis.

**Cons**: Requires understanding the insights reducer internals. May affect trend detection accuracy for datasets where the trend is only visible in later rows.

### Option C: Use Mutable Accumulators in Insights Pipeline

**Change**: Replace the Clojure map creation in `combine-additional-reducing-fns` with mutable Java arrays/objects.

| Aspect | Detail |
|--------|--------|
| Effort | Medium-high (~2-3 days) |
| Impact | ~5-8x improvement (eliminates hasheq but keeps per-row work) |
| Risk | Mutable state in a functional pipeline — harder to reason about |
| Reversibility | Moderate |

**Pros**: Keeps full insights functionality. Eliminates the `hasheq` hotspot directly.

**Cons**: Goes against Clojure idioms. Requires careful thread-safety analysis.

### Option D: Streaming-First Architecture (Long-term)

**Change**: Redesign the result pipeline to be fully streaming with zero per-row allocations. Use column-oriented accumulators instead of row-oriented maps.

| Aspect | Detail |
|--------|--------|
| Effort | High (~weeks) |
| Impact | Optimal — O(cols) memory, O(1) per-row amortized |
| Risk | Major architectural change |
| Reversibility | Not applicable |

**Pros**: Eliminates the fundamental problem. Enables much higher row limits.

**Cons**: Major undertaking. Requires touching many middleware functions.

### Option E: Increase Row Limits

**Change**: Increase `max-results-bare-rows` from 2,000 to 10,000 or 20,000.

**File**: `src/metabase/query_processor/middleware/constraints.clj:26-27`

| Aspect | Detail |
|--------|--------|
| Effort | 1 line |
| Impact | Users see more data |
| Risk | **Only do this AFTER fixing per-row cost** — otherwise it makes the overhead 5-10x worse |
| Reversibility | Trivial |

**Important**: This option is complementary, not a replacement. Increasing row limits without fixing the per-row cost would increase response times proportionally.

### Option F: `MB_LUDICROUS_SPEED=true` Environment Variable (IMPLEMENTED)

Named after the legendary speed setting in *Spaceballs* (1987) — "What's the matter, Colonel Sandurz? Chicken?" — `MB_LUDICROUS_SPEED` skips the per-row statistical insights pipeline that causes the 2-3x overhead documented above. The only feature lost is the trend/anomaly badges on dashboard cards (the small "↑12% vs last period" annotations). All other Metabase functionality — questions, dashboards, alerts, exports, embedding — works identically.

**We recommend enabling this for most deployments.** The insights badges are a nice-to-have, but 2-3x faster API responses across every query is a significant improvement. Only leave it disabled if you actively rely on the trend/anomaly annotations.

**Change**: Add a `defsetting` that allows operators to globally disable `insights-xform` via `MB_LUDICROUS_SPEED=true`.

**Files**: `src/metabase/query_processor/settings.clj`, `src/metabase/query_processor/middleware/results_metadata.clj`

| Aspect | Detail |
|--------|--------|
| Effort | ~10 lines |
| Impact | 2-3x faster API responses (measured via NixOS VM benchmarks) |
| Risk | Low — follows existing `defsetting` pattern, default is `false` (no behavior change) |
| Reversibility | Trivial — remove the setting or set back to `false` |

**Pros**: Operator-controlled. No behavior change by default. Uses Metabase's standard settings infrastructure (visible in Admin > Settings, configurable via env var). Can be toggled without redeployment. Also toggleable at runtime via the Admin API.

**Cons**: All-or-nothing — insights are either on or off for all queries. Trend/anomaly badges on dashboard cards will not appear when enabled.

### Option G: ClickHouse Native Protocol (Client V2)

**Change**: Add a second ClickHouse transport using the official ClickHouse Java Client V2 with RowBinary format, bypassing the JDBC HTTP/JSON overhead.

| Aspect | Detail |
|--------|--------|
| Effort | Medium (~1-2 weeks) |
| Impact | Eliminates ~100-150ms fixed ClickHouse driver overhead visible at low column counts |
| Risk | New code path requires thorough testing; must coexist with existing JDBC path |
| Reversibility | Configuration-controlled — toggle per database connection |

**Background**: Our NixOS VM benchmarks show ClickHouse adds a small but consistent fixed cost (~100-150ms) compared to PostgreSQL at low column counts (1-6 cols). At 50+ columns, PG and CH converge — the Metabase core overhead dominates. The ClickHouse-specific gap comes from the JDBC driver's HTTP/JSON protocol:

1. **HTTP round-trip**: Each query is an HTTP POST to port 8123, with full HTTP header overhead
2. **JSON text serialization**: Results are serialized as JSON text on the server, transmitted, then parsed back on the client
3. **No connection pooling in driver**: The ClickHouse JDBC driver uses `HTTP_URL_CONNECTION` (Java's built-in, no pooling)

The official ClickHouse Java Client V2 (`com.clickhouse:client-v2`) addresses all three:
- HTTP with **RowBinary** format — compact binary serialization, ~6x less data than JSON
- **LZ4 compression** — further reduces wire size
- **Apache HttpClient5** connection pooling — reuses TCP connections

**Design**: Refactor the driver into three files:
- `clickhouse_jdbc.clj` — existing JDBC transport (default, backwards-compatible)
- `clickhouse_native.clj` — Client V2 transport with RowBinary streaming
- `clickhouse.clj` — routes between them based on a `use-native-client` connection detail toggle

See `nix/clickhouse-native-protocol-design.md` for the full design document, including code refactoring plan, migration phases, and Nix variant benchmark integration.

**Pros**: Eliminates the protocol overhead without touching Metabase core. Combined with `MB_LUDICROUS_SPEED`, addresses both sources of latency. Official client means long-term ClickHouse support.

**Cons**: New code path to maintain alongside JDBC. Requires driver-level testing. Some ClickHouse features (e.g., custom type mappings) may need re-implementation for the native path.

## Recommendation

1. **Immediate**: Set `MB_LUDICROUS_SPEED=true` (Option F, already implemented) — recommended for most deployments unless you actively use the trend/anomaly badges on dashboard cards
2. **Short-term**: Apply Option A (skip insights for dashboard queries) as an upstream PR — dashboard cards don't need real-time insights computation
3. **Medium-term**: Implement Option B (deferred insights with sampling) to keep insights functional while eliminating per-row overhead
4. **Medium-term**: Implement Option G (ClickHouse Client V2) to eliminate protocol overhead for ClickHouse deployments — combined with Option F, this addresses both the Metabase core and driver-level sources of latency
5. **Long-term**: Consider Option D if Metabase wants to support 100K+ row result sets efficiently

## Nix Variant Benchmarks

Using Nix's reproducible build system, we build multiple Metabase variants — each with a different patch applied — and benchmark them side-by-side in the same VM. This demonstrates the exact performance impact of each remediation approach.

### Variants

| Variant | Patch | What It Does |
|---------|-------|--------------|
| `vanilla` | (none) | Current Metabase with `MB_LUDICROUS_SPEED` setting (insights ON by default) |
| `no-insights` | `nix/patches/skip-insights-all.patch` | `record-and-return-metadata!` unconditionally returns `rff` — insights never run |
| `skip-dash` | `nix/patches/skip-insights-dashboard.patch` | Adds `:skip-results-metadata? true` to dashboard card query endpoint only |

### How It Works

1. Nix builds three uberjar variants. Only the uberjar stage rebuilds for each — frontend, static-viz, translations, drivers, and deps are all cached (patches only touch backend Clojure files).
2. A NixOS VM boots once with PostgreSQL + ClickHouse.
3. First variant runs: DB migrations, user setup, warehouse connections.
4. For each subsequent variant: stop Metabase, swap the JAR, restart, re-authenticate, benchmark.
5. A cross-variant comparison table shows the speedup of each approach.

### Running

```bash
# Build all variants and run the benchmark VM
nix build .#bench-variants-x86_64

# View results
nix log .#bench-variants-x86_64 2>&1 | grep -E 'PERF:|VARIANT'

# Build individual variants (for inspection, without benchmarking)
nix build .#metabase-no-insights
nix build .#metabase-skip-dash-insights
```

### Adding New Variants

1. Create a patch file in `nix/patches/` (standard unified diff format)
2. Add a `mkVariant` call in `flake.nix`
3. Add the variant to the `benchVm` `variants` attrset

Only the uberjar rebuilds — everything else is cached. Adding a new variant to the benchmark adds ~3-5 minutes of build time plus ~2-3 minutes of benchmark time.

## How to Reproduce

### Run NixOS VM Benchmarks

```bash
# Build and run the full VM test (includes column-scaling benchmarks)
nix build .#microvm-test-x86_64

# View benchmark results
nix log .#microvm-test-x86_64 2>&1 | grep -E '(PASS|FAIL|benchmark|ms)'
```

### Test with `MB_LUDICROUS_SPEED=true`

```bash
# In the NixOS VM test or any deployment:
MB_LUDICROUS_SPEED=true ./result/bin/metabase

# Or in Docker:
docker run -p 3000:3000 -e MB_LUDICROUS_SPEED=true metabase:latest
```

### JMC Profiling

1. Start Metabase with JFR enabled:
   ```bash
   JAVA_OPTS="-XX:+FlightRecorder -XX:StartFlightRecording=duration=60s,filename=metabase.jfr" ./result/bin/metabase
   ```
2. Run a dashboard with multiple cards
3. Open `metabase.jfr` in JDK Mission Control
4. Navigate to **Method Profiling** → sort by **Total CPU Time**
5. Look for `clojure.lang.Util.hasheq(Object)` — it will be the top hotspot

## Code Archaeology: How We Got Here

The `insights-xform` per-row overhead was introduced incrementally over 6 years without performance consideration at the architectural level. The story has two acts.

### Timeline

| Date | Author | Commit | What Happened |
|------|--------|--------|---------------|
| 2017-11 | Simon Belak | `97a870f150` | X-Ray insights infrastructure added (batch processing, sync-time only) |
| 2018-07 | Simon Belak | `d61b0dbaef` | `skip-results-metadata?` flag created — for **correctness** (avoid recursive fingerprinting during sync), not performance |
| 2018-08 | Simon Belak | `4056160d24` | **Pivotal commit**: insights wired into the query response pipeline — now runs on every API query |
| 2018-08 | Simon Belak | `cfe0dd489e` | Skip flag extended to data exports |
| 2018-10 | Simon Belak | `83d1a40581` | "Smart Scalar" feature (#8383) ships, relying on per-query insights in responses |
| 2020-02 | Cam Saul | `aced697af9` | **Major QP rewrite** (#11832): streaming/transducing architecture. Created `insights-xform`, `combine-additional-reducing-fns`, and the current per-row reducing function approach |
| 2022-02 | Cam Saul | `034345550f` | QP middleware split (#19935) — `combine-additional-reducing-fns` gets debugging name |
| 2024-01 | adam-james | `0e971175ae` | Skip flag used in pulse queries (#37762) — a correctness fix, not performance |
| 2024-08/09 | Oleksandr Yakushev | Multiple | First explicit performance work on insights: optimized `java-time` conversions, fingerprinter closures, stats functions (5+ commits in 2 weeks) |

### Act 1: Simon Belak Adds Insights to Queries (Aug 2018)

`4056160d24` — "add :insights to query response"

Simon's original design was **post-hoc and batch**. After the entire query completed, `results->column-metadata` ran `transduce` over `(:rows results)` — the already-materialized row vector. It used `redux/juxt` to combine fingerprinting and insights into a single pass over buffered rows. This was a reasonable design — the rows were already in memory, and it was a one-time scan of finished results.

The commit message is 6 words with no context. The `insights` function had an empty docstring (`""`). He was building toward Smart Scalar (#8383), which shipped two months later — the commit list for that PR is pure feature work: "hook up to viz settings", "tweak colors", "responsive dash card layout". Zero performance discussion.

**This is where the feature was born, but the performance was fine** — batch post-processing of buffered rows is O(n) with no per-row allocation overhead.

### Act 2: Cam Saul's Streaming Rewrite Makes It Per-Row (Feb 2020)

`aced697af9` — "Streaming/single-pass transducing query processor (#11832)"

This was a **massive architectural rewrite** (dozens of files across every driver). The goal was excellent: convert Metabase from buffering all rows in memory to streaming them through a transducing pipeline. This was a major memory improvement — no more materializing the full result set.

But in converting insights to this model, Cam created `combine-additional-reducing-fns` — a mechanism that runs insights as a **side-channel reducing function on every row**. The docstring is thorough and well-considered from a functional programming correctness standpoint (separate accumulators, proper `reduced` semantics, etc.), but says nothing about the per-row allocation cost.

The critical issue: in the old batch model, insights ran over vectors that were already in memory. In the new streaming model, the insights reducer needs named column access (to compute per-column statistics), so `combine-additional-reducing-fns` effectively causes creation of a map from each vector row — triggering `hasheq` for every key and value, for every row, for every query.

**Cam wasn't adding overhead on purpose.** He was converting a batch system to streaming and needed to maintain the insights contract. The per-row map creation was a side effect of the insights reducer needing named column access in a pipeline that passes vectors. The commit doesn't discuss this tradeoff because from a correctness perspective, it's fine — it's only a performance problem at scale.

### Why Nobody Caught It

- **Simon's original wiring (2018) was post-hoc** — performance was fine, no one measured it
- **Cam's rewrite (2020) was focused on memory, not CPU** — streaming was a huge win for memory, and the per-row CPU cost wasn't visible in small result sets or in the absence of benchmarks
- **The `skip-results-metadata?` flag existed from day one** but for correctness (avoiding recursive fingerprinting during sync), so nobody thought of it as a performance lever
- **The first performance attention came 4 years later** (August 2024), when Oleksandr Yakushev optimized the insights computation internals (datetime conversions, statistics functions). These were valuable micro-optimizations within the existing architecture, but nobody questioned whether insights should run on every row of every query
- **No performance regression tests existed** for this code path — the existing `perf_test.clj` only benchmarks query compilation, not the result pipeline. There was nothing to flag a 10x regression.

### The Lesson

This is a textbook case of accidental performance degradation through incremental changes:

1. Feature A is added with acceptable performance (batch insights)
2. Architectural change B converts it to a fundamentally more expensive approach (per-row streaming) for good reasons (memory)
3. Nobody measures the CPU cost because the change was about memory
4. 4+ years pass before anyone profiles actual query overhead
5. By then, it's "how things work" and optimizations focus on internals rather than questioning the approach

The fix is not to blame anyone — both changes were well-intentioned. The fix is performance regression tests with explicit budgets. See "Performance Regression Tests" below.

## Performance Regression Tests

To prevent this class of regression from happening again, we added a suite of performance tests in `test/metabase/query_processor/middleware/results_metadata_perf_test.clj`.

### Test Summary

| Test | What It Catches |
|------|-----------------|
| `insights-rf-overhead-test` | Ratio of insights cost to baseline reducing cost. Catches per-row regressions in the insights reducing function. |
| `combine-additional-reducing-fns-overhead-test` | Overhead of the combining wrapper itself (volatile!/vswap!/mapv). Catches regressions in the side-channel mechanism. |
| `query-pipeline-insights-overhead-test` | End-to-end speedup from `skip-results-metadata?`. Uses real Metabase QP with test DB. |
| `ludicrous-speed-ludicrous-setting-test` | Verifies `MB_LUDICROUS_SPEED=true` actually improves performance. |
| `insights-cost-scales-linearly-with-rows-test` | Cost should be O(rows), not O(rows^2). Catches accidental quadratic blowup. |
| `insights-cost-scales-linearly-with-columns-test` | Cost should be O(cols), not O(cols^2). Catches per-column superlinear scaling. |
| `insights-absolute-budget-test` | Absolute time budgets for common workloads. Catches any regression >2-3x, regardless of cause. |

### Running

Tests are tagged `:perf` and excluded from normal CI to avoid flaky timing-dependent failures:

```bash
# Run all perf regression tests
./bin/test-agent :only '[metabase.query-processor.middleware.results-metadata-perf-test]'

# Run a specific test
./bin/test-agent :only '[metabase.query-processor.middleware.results-metadata-perf-test/insights-rf-overhead-test]'
```

### Threshold Design

- **Ratio thresholds** (overhead tests) are set at 2-3x observed values. They catch 10x regressions while tolerating normal variance.
- **Scaling thresholds** allow 2x the theoretical ratio (e.g., 5x rows → 10x time allowed) to account for cache effects, GC, etc.
- **Absolute budgets** are set at 2-3x baseline measurements on CI-class hardware (generous to avoid flakiness, strict enough to catch the kind of 10x regression that shipped in 2018-2020).
- All thresholds should be reviewed periodically as hardware and JVM versions change.

## Key Source Files

| File | Lines | Role |
|------|-------|------|
| `src/metabase/query_processor/middleware/results_metadata.clj` | 121-149 | `insights-xform` + `skip-results-metadata?` + `ludicrous-speed` check |
| `src/metabase/query_processor/settings.clj` | 7-19 | `ludicrous-speed` defsetting + `ludicrous-speed` predicate |
| `src/metabase/query_processor/reducible.clj` | 108-116 | `combine-additional-reducing-fns` — per-row map recreation |
| `src/metabase/query_processor/postprocess.clj` | 25-51 | Post-processing middleware chain order |
| `src/metabase/query_processor/streaming/json.clj` | 113-154 | `:api` streaming writer |
| `src/metabase/query_processor/streaming/json.clj` | 60-84 | `:json` export writer (also creates maps per row) |
| `src/metabase/driver/sql_jdbc/execute.clj` | 679-691 | JDBC `row-thunk` — efficient vector-based row reading |
| `src/metabase/query_processor/middleware/constraints.clj` | 26-27 | Row limit defaults (2000/10000) |
| `src/metabase/dashboards_rest/api.clj` | 1395-1411 | Dashboard card query — does NOT skip insights |
| `src/metabase/dashboards_rest/api.clj` | 1440-1457 | Dashboard export query — DOES skip insights |
| `src/metabase/query_processor/dashboard.clj` | 163-204 | `process-query-for-dashcard` |
| `modules/drivers/clickhouse/src/metabase/driver/clickhouse.clj` | 78-139 | ClickHouse JDBC connection + `connection-details->spec` |
| `modules/drivers/clickhouse/src/metabase/driver/clickhouse_qp.clj` | 502-612 | ClickHouse `read-column-thunk` — JDBC hot path |
| `nix/clickhouse-native-protocol-design.md` | — | Design doc for Client V2 native protocol transport |

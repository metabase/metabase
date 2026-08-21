# Nix Build System — Progress & Current State

Last updated: 2026-04-01

## STARTUP CRASH: FIXED

The Malli schema crash (`ExceptionInInitializerError` / `:malli.core/invalid-schema`) is **resolved**. Nix-built JARs start successfully.

### Root Cause: Clojure AOT Classloader Split

Clojure 1.12's `RT.load()` uses **strict greater-than** (`classTime > sourceTime`) to decide between AOT class and source. In a Nix sandbox, all ZIP entry timestamps are normalized to the same value (`1980-01-01 04:01:00`). When timestamps are equal, Clojure loads from `.cljc` source via `DynamicClassLoader` instead of AOT `__init.class` via `AppClassLoader`.

This creates **two copies** of protocol interfaces (e.g., `malli.core.IntoSchema`) in different classloaders. Protocol dispatch (`satisfies?`) returns `false` because the interfaces are different class objects.

Full investigation documented in `nix/hashcode-investigation.md`.

### Fix: Strip AOT-shadowed source files from uberjar

Post-build step in `nix/derivation/uberjar.nix` uses a deterministic extract-filter-repack approach:
1. Extracts the uberjar to a temp directory
2. Finds `.clj`/`.cljc`/`.cljs` files that have a corresponding `__init.class` and removes them
3. Normalizes all filesystem timestamps to `1980-01-01 00:01:00`
4. Repacks with `jar --date=1980-01-01T00:01:00+00:00` for deterministic ZIP entry timestamps

This replaces the previous `zip -qd` + `stripJavaArchivesHook` approach which required an 8-hour fixup phase.

Result: ~506 source files stripped. 619 source files remain (those without AOT counterparts).

### OCI fix: `MB_PLUGINS_DIR=/plugins`

Added to OCI image Env — Metabase was looking in `/app/plugins` (relative to WorkingDir) instead of `/plugins` (the declared volume).

### Bugs fixed in the stripping script
1. `JAVA_TOOL_OPTIONS` interference: `jar tf` picked up `-XX:hashCode=3` and failed silently → prefix with `JAVA_TOOL_OPTIONS=""`
2. `set -e` abort: `grep -qxF ... && echo ...` returns non-zero when grep doesn't match → add `|| true`

### Build time
- Build phase (compile + deterministic repack): ~3-5 minutes
- No fixup phase needed — the extract-filter-repack produces a deterministic JAR directly
- Previous approach (`zip -qd` + `stripJavaArchivesHook`) took ~8 hours due to `strip-nondeterminism` processing the ~400MB uberjar entry-by-entry
- `stripJavaArchivesHook` is still used for translations and drivers (small JARs, fast fixup)

## Verification Status

| Test | Status |
|------|--------|
| `verify-oci-sizes` | PASS |
| `verify-oci-flags` | PASS |
| `verify-core-drivers` | PASS |
| `metabase` binary startup | PASS |
| `metabase-core` binary startup | PASS |
| `check-reproducibility translations` | **PASS** (10 rounds) |
| `check-reproducibility uberjar` | **PASS** (10 rounds, hashCode=2 + proxy normalization + deterministic repack) |
| `check-reproducibility uberjar-core` | **PASS** (10 rounds) |
| `check-reproducibility drivers` | **PASS** (10 rounds) |
| `check-reproducibility --all` | 6/8 PASS — `frontend` and `static-viz` fail (rspack/shadow-cljs non-determinism, separate issue) |
| `check-reproducibility metabase` | **PASS** (2 rounds) |
| `check-reproducibility metabase-core` | **PASS** (2 rounds) |
| `tests-all` (integration) | **PASS** (health-check, api-smoke, db-migration) |
| `tests-oci-x86_64` (OCI lifecycle) | **PASS** (healthy in 2s, API version correct) |
| `mb-test-x86_64` (NixOS VM) | **PASS** (15 checks: health, API, DB migrations, 3 engines, setup, PG+CH warehouses, 6 query benchmarks at 20K rows) |

## Current File State

### Changed files
- `nix/derivation/uberjar.nix`: Deterministic extract-filter-repack + proxy class normalization (no `stripJavaArchivesHook`), uses `clojureBuildInputsBase`
- `nix/derivation/NormalizeProxyClasses.java`: ASM-based normalizer — sorts proxy class methods by (name, descriptor) with `COMPUTE_FRAMES` for valid stack maps
- `nix/derivation/lib.nix`: `JAVA_TOOL_OPTIONS` with `-XX:hashCode=2`; exports `clojureBuildInputsBase` (without `stripJavaArchivesHook`) and `clojureBuildInputs` (with it)
- `nix/oci/default.nix`: Added `MB_PLUGINS_DIR=/plugins` to OCI Env
- `nix/readme.md`: Updated Reproducibility section with hashCode=2, proxy normalization, and JAR determinism details

### Completed work (from previous sessions)
- Added `uberjar-core`, `metabase-core` targets to reproducibility checks and build-smoke
- Added `--rounds N` flag to `check-reproducibility`
- Extended `oci-builds` check for minimal and core variants
- Implemented per-driver OCI images (17 drivers x 3 architectures)
- Updated `nix/readme.md` with measured OCI sizes and per-driver documentation
- Reproducibility confirmed for translations (with and without hashCode=3)
- Previously confirmed: uberjar reproducible with hashCode=3 + stripJavaArchivesHook

## Remaining Work
1. ~~Build uberjar with deterministic repack~~ DONE
2. ~~Verify reproducibility (`nix build .#uberjar --rebuild`)~~ DONE — PASS
3. ~~Run `check-reproducibility -- --rounds 2`~~ DONE — all 4 targets PASS
4. ~~Run `check-reproducibility -- --all --rounds 2`~~ DONE — 6/8 PASS
5. Investigate frontend/static-viz non-determinism (rspack/shadow-cljs — separate issue)
6. ~~Run `tests-all` integration tests~~ DONE — all 3 PASS
7. ~~Run `tests-oci-x86_64` OCI lifecycle test~~ DONE — PASS

## Change Log

### 2026-03-29: Deterministic repack (eliminate 8-hour fixup)

**Problem**: `zip -qd` (used to strip AOT-shadowed sources from the uberjar) produces non-deterministic ZIP internal structure (1-byte size variance). This required `stripJavaArchivesHook` in the fixup phase, which runs `strip-nondeterminism --type jar` — a Perl tool that processes the ~400MB uberjar entry-by-entry, taking ~8 hours.

**Solution**: Replace `zip -qd` + `stripJavaArchivesHook` with an extract-filter-repack that produces a deterministic JAR directly:
1. `jar xf` to extract to filesystem
2. `find` + `rm` to strip AOT-shadowed `.clj`/`.cljc`/`.cljs` files
3. `touch -d '1980-01-01 00:01:00'` to normalize filesystem timestamps
4. `jar --date=1980-01-01T00:01:00+00:00 --create` to repack with deterministic ZIP timestamps

**Files changed**:
- `nix/derivation/lib.nix` — split `clojureBuildInputs`, changed hashCode 3 → 2
- `nix/derivation/uberjar.nix` — extract-filter-repack + proxy normalization
- `nix/derivation/NormalizeProxyClasses.java` — ASM-based proxy class normalizer
- `nix/readme.md` — updated Reproducibility section

**Investigation journey**:
1. `hashCode=3` (atomic counter): 2,845 class files differed — JVM background threads consume counter non-deterministically
2. `hashCode=2` (constant): reduced to 1 file — `MimeMessage$ff19274a` proxy class
3. Root cause: `Class.getConstructors()` returns constructors in unspecified order per JDK spec
4. Fix: ASM normalizer sorts methods by (name, descriptor), rebuilds constant pool deterministically

**Status**: **VERIFIED** — all Clojure targets pass `--rebuild` (10 rounds each). Build time: ~3 minutes.

### 2026-03-31: Comprehensive application-layer testing

**Added to NixOS VM test** (`nix/microvms/mkVm.nix`):
- Complete first-user setup via `/api/setup`
- Add PostgreSQL + ClickHouse as warehouse connections
- ClickHouse driver loaded from Nix-built plugin JAR
- 6 benchmark scenarios at 20K rows through Metabase query pipeline (both engines)
- Query body written to temp file to avoid shell quoting limits on large JSON
- Metabase `constraints` override (`max-results` + `max-results-bare-rows`) to bypass 2K default row limit

**Benchmark results — column-scaling series** (20K rows, NixOS VM, 4GB RAM):

| Query | Cols | PG (ms) | CH (ms) | CH/PG | Overhead |
|-------|------|---------|---------|-------|----------|
| SELECT 1 | 1 | 102 | 90 | 0.88x | -12ms |
| 1col x 20K | 1 | 371 | 210 | 0.57x | -161ms |
| SUM(100K) | 1 | 92 | 137 | 1.48x | +45ms |
| 6col x 20K | 6 | 488 | 644 | 1.32x | +156ms |
| 20col x 20K | 20 | 1312 | 1416 | 1.08x | +104ms |
| 50col x 20K | 50 | 2821 | 2805 | 0.99x | -16ms |
| 100col x 20K | 100 | 3809 | 3826 | 1.00x | +17ms |

**Key findings**:
1. **~100ms baseline overhead** for Metabase round-trip (both engines, even SELECT 1)
2. **ClickHouse driver adds a small fixed cost** (~100-150ms) visible at 6 cols, but constant not per-column
3. **At 50+ cols, PG and CH are identical** — bottleneck is Metabase's core result processing
4. **The 10x overhead reported in production** (21ms SQL → 370ms API, see [discourse thread](https://discourse.metabase.com/t/metabase-x10-times-slower-than-the-sql-query/215352)) is mostly Metabase middleware + `clojure.lang.Util.hasheq()` processing, not ClickHouse-specific
5. JMC profiling confirms `hasheq(Object)` as the CPU hotspot in result pipeline

**Fixes**:
- MicroVM port changed from 3000 → 30000 (avoid conflicts with host Metabase)
- Removed unused `PHASE3_MS`-`PHASE5_MS` variables (shellcheck)
- Simplified fullTest to use NixOS test framework (one-shot VM, no host-side curl)
- Surface test results via `nix log` grep in fullTest output

**Files changed**:
- `nix/microvms/mkVm.nix` — expanded test script (15 checks + perf), ClickHouse service + driver
- `nix/microvms/lib.nix` — simplified fullTest, fixed shellcheck
- `nix/microvms/constants.nix` — port 3000 → 30000
- `nix/microvms/default.nix` — pass `clickhouseDriver` through
- `flake.nix` — pass `clickhouseDriver` to microvms

### 2026-03-31: Query pipeline performance analysis & `MB_LUDICROUS_SPEED`

**Problem**: 10x+ overhead between SQL execution and API response. JMC profiling identified `clojure.lang.Util.hasheq(Object)` as the CPU hotspot. NixOS VM benchmarks confirmed the bottleneck is Metabase core (PG and CH converge at 50+ columns).

**Root cause**: `insights-xform` in `results_metadata.clj` runs statistical fingerprinting on every row via `combine-additional-reducing-fns`, which recreates Clojure maps per row — triggering `hasheq` for every key and value.

**Discovery**: Metabase already has `skip-results-metadata?` that bypasses this entirely — used for exports (`dashboards_rest/api.clj:1453`) but not for dashboard card queries (`dashboards_rest/api.clj:1395`).

**Solution**: Added `MB_LUDICROUS_SPEED` defsetting. When set to `true`, `record-and-return-metadata!` skips `insights-xform` — same effect as `skip-results-metadata?` but operator-controlled via environment variable.

**Code archaeology**: Traced the full history. Insights were originally sync-time only (2017, Simon Belak). Moved into live query pipeline in Aug 2018 for Smart Scalar without performance assessment. The 2020 streaming QP rewrite (Cam Saul, #11832) made it structural — per-row via `combine-additional-reducing-fns`. First performance attention came 4 years later (Aug 2024, Oleksandr Yakushev) with micro-optimizations, but nobody questioned the per-row architecture. See `nix/performance-analysis.md` for full timeline.

**A/B benchmark**: NixOS VM test now runs the full column-scaling suite twice — once with insights enabled (default), once with `MB_LUDICROUS_SPEED=true` — and prints a side-by-side comparison table showing the speedup.

**Performance regression tests**: Added 7 Clojure tests tagged `:perf` in `results_metadata_perf_test.clj` that measure insights overhead at multiple levels: raw reducing function, combining wrapper, end-to-end QP pipeline, setting toggle, row scaling, column scaling, and absolute time budgets. Tagged `:perf` and excluded from normal CI (added to `:exclude-tags` in `deps.edn`).

**Nix variant benchmarks**: Added `nix/patches/` with two patches (`skip-insights-all.patch`, `skip-insights-dashboard.patch`), a `mkVariant` builder in `derivation/default.nix`, and `mkBenchVm.nix` that boots a single VM, swaps JARs between variants, and produces a cross-variant comparison table. Run with `nix build .#bench-variants-x86_64`. Only the uberjar stage rebuilds per variant — all other sub-derivations are cached.

**Variant benchmark results** (20K rows, NixOS VM, 4GB RAM, PostgreSQL, confirmed 2026-04-01):

| Query | Cols | vanilla (ms) | no-insights (ms) | skip-dash (ms) | no-insights speedup | skip-dash speedup |
|-------|------|-------------|-------------------|----------------|--------------------|--------------------|
| SELECT 1 | 1 | 101 | 71 | 76 | 1.43x | 1.32x |
| 1col x 20K | 1 | 288 | 172 | 177 | **1.67x** | **1.63x** |
| 6col x 20K | 6 | 545 | 236 | 340 | **2.30x** | **1.60x** |
| 20col x 20K | 20 | 1089 | 596 | 808 | **1.83x** | **1.35x** |
| 50col x 20K | 50 | 2754 | 1256 | 2534 | **2.19x** | 1.09x |
| 100col x 20K | 100 | 3537 | 2419 | 3754 | 1.46x | 0.94x |

ClickHouse results (same run):

| Query | Cols | vanilla (ms) | no-insights (ms) | skip-dash (ms) | no-insights speedup | skip-dash speedup |
|-------|------|-------------|-------------------|----------------|--------------------|--------------------|
| SELECT 1 | 1 | 100 | 71 | 76 | 1.41x | 1.32x |
| 1col x 20K | 1 | 231 | 131 | 147 | **1.77x** | **1.58x** |
| 6col x 20K | 6 | 573 | 223 | 332 | **2.57x** | **1.73x** |
| 20col x 20K | 20 | 1454 | 541 | 871 | **2.69x** | **1.67x** |
| 50col x 20K | 50 | 2836 | 1327 | 2591 | **2.14x** | 1.09x |
| 100col x 20K | 100 | 3768 | 2449 | 3709 | 1.54x | 1.02x |

**Summary**: `no-insights` variant delivers **1.7-2.7x speedup** at the common 1-50 column range. The `skip-dash` variant (dashboard queries only) delivers **1.3-1.7x**. Both engines show the same pattern, confirming the overhead is in Metabase's core pipeline. Setting `MB_LUDICROUS_SPEED=true` provides the same benefit as `no-insights` at runtime.

**Files changed**:
- `src/metabase/query_processor/settings.clj` — added `ludicrous-speed` defsetting (`MB_LUDICROUS_SPEED=true`)
- `src/metabase/query_processor/middleware/results_metadata.clj` — check `ludicrous-speed` in `record-and-return-metadata!`
- `nix/performance-analysis.md` — full analysis document with evidence, root cause trace, archaeology, and remediation options
- `nix/readme.md` — updated TODO section with pointer to analysis doc
- `nix/microvms/mkVm.nix` — dual-pass benchmark (insights ON vs OFF) with comparison table
- `nix/microvms/mkBenchVm.nix` — NEW: multi-variant benchmark VM
- `nix/patches/skip-insights-all.patch` — NEW: unconditionally skip insights
- `nix/patches/skip-insights-dashboard.patch` — NEW: skip insights for dashboard queries only
- `nix/derivation/default.nix` — added `mkVariant` builder for patched uberjar variants
- `flake.nix` — added variant packages and `bench-variants-x86_64`
- `test/metabase/query_processor/middleware/results_metadata_perf_test.clj` — NEW: 7 perf regression tests
- `deps.edn` — added `:perf` to `:exclude-tags`

### 2026-04-01: ClickHouse native protocol design

**Problem**: ClickHouse adds ~100-150ms fixed overhead vs PostgreSQL at low column counts. Both engines converge at 50+ columns (Metabase core dominates), but the protocol gap is significant for typical 1-20 column dashboard queries.

**Root cause**: The ClickHouse JDBC driver uses HTTP/JSON on port 8123 — text serialization, no connection pooling (`HTTP_URL_CONNECTION`), full HTTP headers per query.

**Analysis**: Evaluated three alternatives:
1. **housepower/ClickHouse-Native-JDBC** — native TCP port 9000, 6-7x faster reads, but third-party with uncertain maintenance
2. **Official ClickHouse Java Client V2** — HTTP with RowBinary binary format, LZ4 compression, Apache HttpClient5 pooling
3. **Arrow Flight SQL** — columnar streaming, not production-ready for ClickHouse

**Decision**: Option 2 (Official Client V2) — best long-term support from ClickHouse team, RowBinary eliminates JSON serialization overhead, and the official client has a roadmap for native TCP (issue #1644) which would give us an automatic upgrade path.

**Design**: Three-file refactoring:
- `clickhouse_jdbc.clj` — existing JDBC transport (default)
- `clickhouse_native.clj` — Client V2 transport with RowBinary streaming
- `clickhouse.clj` — routes between them via `use-native-client` connection toggle

**Testing plan**: Nix variant benchmarks extended with `ch-native` and `ch-native-no-insights` variants, correctness validation via dual-warehouse comparison.

**Files created**:
- `nix/clickhouse-native-protocol-design.md` — full design document
- `nix/performance-analysis.md` — updated with Option G and dual-overhead analysis

### 2026-04-01: ClickHouse Client V2 native transport — implementation & benchmarks

**Implementation**: Added `clickhouse_native.clj` with Client V2 binary protocol transport:
- HTTP with RowBinary format, LZ4 compression, Apache HttpClient5 connection pooling
- Streaming `IReduceInit` reducible rows from `ClickHouseBinaryFormatReader`
- Atom-based client cache keyed by connection details
- Positional `?` parameter substitution (matching JDBC HTTP behavior)
- Column metadata from `TableSchema` with existing `database-type->base-type` mapping

**Routing**: `clickhouse.clj` overrides `driver/execute-reducible-query` — checks `use-native-client` connection detail, routes to native or JDBC path.

**Nix benchmark**: Extended `mkBenchVm.nix` with 3 warehouses (PG, CH-JDBC, CH-Native) across all 3 variants.

**Protocol comparison results** (vanilla variant, 20K rows, NixOS VM):

| Query | Cols | CH-JDBC (ms) | CH-Native (ms) | Speedup |
|-------|------|-------------|----------------|---------|
| SELECT 1 | 1 | 105 | 85 | 1.23x |
| 1col x 20K | 1 | 265 | 145 | **1.83x** |
| 6col x 20K | 6 | 674 | 456 | **1.48x** |
| 20col x 20K | 20 | 1334 | 1236 | 1.08x |
| 50col x 20K | 50 | 2068 | 1902 | 1.09x |
| 100col x 20K | 100 | 3779 | 3382 | 1.12x |

**Best combined result** (CH-Native + no-insights):

| Query | Cols | Vanilla CH-JDBC (ms) | Native+NoInsights (ms) | Speedup |
|-------|------|---------------------|----------------------|---------|
| 1col x 20K | 1 | 265 | 89 | **3.0x** |
| 6col x 20K | 6 | 674 | 244 | **2.8x** |
| 20col x 20K | 20 | 1334 | 523 | **2.6x** |

**Key findings**:
1. Native client delivers **1.8x speedup at low column counts** where JDBC overhead dominates
2. Tapers to ~1.1x at high column counts where Metabase middleware dominates
3. Combined with `no-insights`, achieves **2.6-3.0x end-to-end improvement**
4. Confirms the two-overhead model: protocol overhead (fixed by native) + middleware overhead (fixed by no-insights)

**Files changed**:
- `modules/drivers/clickhouse/src/metabase/driver/clickhouse_native.clj` — NEW: Client V2 transport
- `modules/drivers/clickhouse/src/metabase/driver/clickhouse.clj` — routing via `execute-reducible-query`
- `nix/microvms/mkBenchVm.nix` — 3-warehouse benchmarks with protocol comparison table

## Key Files
- `nix/derivation/uberjar.nix` — uberjar build + deterministic repack (AOT source stripping + proxy normalization + JAR normalization)
- `nix/derivation/NormalizeProxyClasses.java` — ASM-based proxy class bytecode normalizer
- `nix/derivation/lib.nix` — shared helpers, `JAVA_TOOL_OPTIONS` flag (`-XX:hashCode=2`)
- `nix/oci/default.nix` — OCI image generation including per-driver images
- `nix/oci/layers.nix` — layer decomposition, `extraPlugins` parameter
- `nix/hashcode-investigation.md` — full root cause analysis
- `flake.nix` — all targets, checks, reproducibility scripts

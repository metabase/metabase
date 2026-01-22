# Query Processor CPU and Memory Benchmarks - Implementation Plan

## Existing Benchmarks

### 1. Query Processor Compilation Benchmark
**File**: `test/metabase/query_processor/perf_test.clj`

Benchmarks query compilation (MBQL → SQL) using Criterium with mock metadata providers:
- Small: 5 tables × 10 columns
- Medium: 5 tables × 100 columns
- Large: 5 tables × 1000 columns
- Huge: 5 tables × 10,000 columns

**Coverage**: Only `qp.compile/compile` - does NOT cover preprocessing, execution, or HTTP API.

```clojure
;; REPL usage
(compile-time mp-medium trivial-query computed-cache-on)
```

### 2. Search Performance Benchmark
**File**: `dev/src/dev/search_perf.clj`

Full load testing framework for search functionality:
- Creates 10k+ tables, users, permission groups
- Tracks p50/p95 percentiles
- Warmup iterations
- Multiple search patterns

```clojure
;; REPL usage
(run-full-benchmark! {:num-tables 10000 :num-groups 10 :num-users 100})
```

### 3. Memory Utilities
**File**: `dev/src/dev/memory.clj`

Thread allocation measurement utilities:
- `measure-thread-allocations` - Bytes allocated by a function
- `with-memory-logging` - Macro for memory logging

### 4. Available Dependencies (in deps.edn :dev alias)
- `criterium/criterium {:mvn/version "0.4.6"}` - Statistical benchmarking
- `com.clojure-goes-fast/clj-async-profiler` - Flame graphs
- `com.clojure-goes-fast/clj-memory-meter` - Deep object sizing
- `com.clojure-goes-fast/jvm-alloc-rate-meter` - Heap allocation monitoring

### Gap Analysis
The existing benchmarks do NOT cover:
- Full query execution (preprocessing + compilation + execution)
- HTTP API layer performance
- Concurrent load testing
- Memory profiling per query type
- Native queries, nested queries, pivots, exports

---

## Overview

Add a comprehensive benchmarking suite for Metabase query processing that covers:
- **Unit benchmarks**: Isolated QP phase testing (preprocess, compile, execute)
- **Integration benchmarks**: Full query execution through API
- **Load testing**: 50-200+ concurrent HTTP requests with percentile tracking
- **Memory profiling**: Heap allocations and object sizing per query

**Target databases**: H2 (default/CI) + Postgres (realistic testing)
**Execution modes**: CI smoke tests + local REPL-driven profiling

---

## Directory Structure

```
dev/src/dev/benchmark/
├── core.clj              # Criterium wrappers, config, percentile calculations
├── memory.clj            # Memory profiling (extends dev.memory)
├── profiler.clj          # clj-async-profiler integration (flame graphs)
├── queries/
│   └── definitions.clj   # Query library: MBQL, native, nested, pivot, exports
├── qp/
│   ├── unit.clj          # Isolated QP phase benchmarks
│   └── integration.clj   # Full query execution benchmarks
├── load/
│   ├── concurrent.clj    # HTTP load testing with thread pools
│   └── data_setup.clj    # Large dataset creation for Postgres
└── report/
    ├── console.clj       # Pretty-printed console output
    └── json.clj          # JSON reports for CI artifacts

test/metabase/benchmark/
└── smoke_test.clj        # Quick CI verification (no perf thresholds)
```

---

## Implementation Steps

### Step 1: Core Benchmark Infrastructure
**Files**: `dev/src/dev/benchmark/core.clj`

Create Criterium wrappers with structured result output:
- `bench` - Run benchmark, return `{:mean-ns :std-dev-ns :percentiles {:p50 :p95 :p99}}`
- `bench-quick` - Fast mode for smoke tests
- Configuration via `*benchmark-config*` dynamic var

**Pattern to follow**: `test/metabase/query_processor/perf_test.clj` lines 88-96

```clojure
(defn bench [thunk & {:keys [quick?]}]
  (let [results (if quick?
                  (crit/quick-benchmark (thunk) {})
                  (crit/benchmark (thunk) {}))]
    {:mean-ns (first (:mean results))
     :percentiles (calculate-percentiles (:samples results))}))
```

---

### Step 2: Query Definitions Library
**Files**: `dev/src/dev/benchmark/queries/definitions.clj`

Define representative queries using `metabase.test.data`:
- `simple-select` - Basic table scan
- `aggregation-query` - COUNT, SUM with filters
- `join-query` - Multi-table joins with breakouts
- `nested-query` - Query with saved question as source
- `native-query` - Raw SQL execution
- `pivot-query` - Pivot table generation

Each returns a proper MBQL query map.

---

### Step 3: Unit Benchmarks (QP Phases)
**Files**: `dev/src/dev/benchmark/qp/unit.clj`

Benchmark isolated QP phases:

```clojure
(defn benchmark-preprocess [query]
  (qp.setup/with-qp-setup [query query]
    (mu/disable-enforcement
      (bench #(qp.preprocess/preprocess query)))))

(defn benchmark-compile [query]
  (qp.setup/with-qp-setup [query query]
    (mu/disable-enforcement
      (let [preprocessed (qp.preprocess/preprocess query)]
        (bench #(qp.compile/compile-preprocessed preprocessed))))))
```

**Key targets**:
- `qp.preprocess/preprocess` - 42+ middleware steps
- `qp.compile/compile-preprocessed` - MBQL → SQL
- Individual middleware: `resolve-fields`, `add-remaps`, `annotate/expected-cols`

---

### Step 4: Integration Benchmarks
**Files**: `dev/src/dev/benchmark/qp/integration.clj`

Full end-to-end benchmarks:

```clojure
(defn benchmark-process-query [query]
  (bench #(qp/process-query (qp/userland-query-with-default-constraints query))))

(defn benchmark-api-query [query user]
  (bench #(mt/user-http-request user :post 200 "dataset" query)))

(defn benchmark-export [query format user]
  (bench #(mt/user-http-request user :post 200
            (str "dataset/" (name format)) {:query query})))
```

Test all query types + export formats (CSV, JSON, XLSX).

---

### Step 5: Load Testing (Concurrent HTTP)
**Files**: `dev/src/dev/benchmark/load/concurrent.clj`

Heavy concurrency testing (50-200+ concurrent):

```clojure
(defn run-load-test [{:keys [concurrent-requests duration-seconds query user]}]
  (let [pool (cp/threadpool concurrent-requests)
        results (atom [])]
    (cp/pfor pool (range concurrent-requests)
      (while-within-duration
        (swap! results conj (execute-request query user))))
    (calculate-stats @results)))
```

**Output**:
- Throughput (requests/second)
- Latency percentiles (p50, p95, p99)
- Error rate
- Total requests

**Dependencies**: Add `org.clj-commons/claypoole` to `:dev` alias if not present.

---

### Step 6: Memory Profiling
**Files**: `dev/src/dev/benchmark/memory.clj`

Extend existing `dev.memory` utilities:

```clojure
(defn profile-query-memory [query]
  (let [{:keys [allocations]} (memory/measure-thread-allocations
                                #(qp/process-query query))
        result-size (mm/measure result)]
    {:thread-allocations-bytes allocations
     :result-size-bytes result-size
     :bytes-per-row (/ result-size row-count)}))
```

**Uses**:
- `dev.memory/measure-thread-allocations` (existing)
- `clj-memory-meter.core/measure` for deep object sizing
- `jvm-alloc-rate-meter` for allocation rate during load

---

### Step 7: Async Profiler (Flame Graphs)
**Files**: `dev/src/dev/benchmark/profiler.clj`

Generate CPU and allocation flame graphs:

```clojure
(defn profile-query-cpu [query & {:keys [iterations output-dir]}]
  (prof/profile {:event :cpu :output-dir output-dir}
    (dotimes [_ iterations]
      (qp/process-query query)))
  (prof/generate-flamegraph output-dir))
```

Output HTML flame graphs to `target/profiler/`.

---

### Step 8: Reporting
**Files**: `dev/src/dev/benchmark/report/{console,json}.clj`

**Console output**: Formatted table with benchmark name, mean, p50, p95, p99
**JSON output**: Machine-readable for CI artifacts

```clojure
(defn generate-report [results]
  {:timestamp (java.time.Instant/now)
   :git-sha (git-sha)
   :jvm-version (System/getProperty "java.version")
   :results results})
```

Support baseline comparison with configurable regression threshold.

---

### Step 9: CI Integration
**Files**: `test/metabase/benchmark/smoke_test.clj`, `deps.edn`

Smoke tests verify benchmarks complete without errors (no perf assertions):

```clojure
(deftest ^:benchmark preprocess-benchmark-smoke-test
  (testing "Preprocess benchmark completes"
    (let [result (unit/benchmark-preprocess (queries/simple-select))]
      (is (pos? (:mean-ns result)))
      (is (< (:mean-ns result) 1e10))))) ; Sanity: < 10 seconds
```

**deps.edn alias**:
```clojure
:benchmark {:extra-paths ["dev/src"]
            :exec-fn dev.benchmark.runner/run-benchmarks
            :exec-args {:output-path "target/benchmark-results.json"}}
```

---

### Step 10: Database Setup (H2 + Postgres)
**Files**: `dev/src/dev/benchmark/load/data_setup.clj`

**H2**: Use standard test data (`metabase.test.data/db`)
**Postgres**: Create larger datasets using `dev.add-load` patterns

```clojure
(def data-sizes
  {:small  {:tables 5  :rows-per-table 100}
   :medium {:tables 10 :rows-per-table 1000}
   :large  {:tables 20 :rows-per-table 10000}})

(defn ensure-benchmark-data! [size]
  (case (driver/the-driver)
    :h2 (data/db)
    :postgres (create-postgres-benchmark-data! size)))
```

---

## Key Files to Reference

| Purpose | Existing File |
|---------|--------------|
| Criterium patterns | `test/metabase/query_processor/perf_test.clj` |
| Load testing patterns | `dev/src/dev/search_perf.clj` |
| Memory utilities | `dev/src/dev/memory.clj` |
| Bulk data loading | `dev/src/dev/add_load.clj` |
| Test data setup | `test/metabase/test/data.clj` |
| HTTP test client | `test/metabase/test/http_client.clj` |

---

## REPL Usage Examples

```clojure
;; Unit benchmarks
(require '[dev.benchmark.qp.unit :as unit])
(unit/run-all-unit-benchmarks)

;; Integration benchmarks
(require '[dev.benchmark.qp.integration :as integration])
(integration/run-all-integration-benchmarks)

;; Load test with 100 concurrent for 30 seconds
(require '[dev.benchmark.load.concurrent :as load])
(load/run-load-test {:concurrent-requests 100
                     :duration-seconds 30
                     :query (queries/simple-select)})

;; CPU flame graph
(require '[dev.benchmark.profiler :as profiler])
(profiler/profile-query-cpu (queries/complex-join))
;; Open target/profiler/*.html
```

---

## CI Usage

```bash
# Quick smoke tests
clojure -X:dev:test :only '["test/metabase/benchmark"]' :include-tags '[:benchmark]'

# Full benchmark with JSON report
clojure -X:dev:benchmark :output-path target/benchmark-results.json
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Flaky CI tests | Smoke tests verify completion only, no performance thresholds |
| Thread pool exhaustion | Configure Jetty threads (MB_JETTY_MAXTHREADS) for load tests |
| Memory leaks during load | Monitor heap, limit duration, force GC between tests |
| Non-reproducible results | Record JVM version, git SHA, use relative comparisons |
| H2 unrealistic for production | Postgres available for local testing with larger datasets |

---

## Dependencies to Add

```clojure
;; In deps.edn :dev alias (if not already present)
org.clj-commons/claypoole {:mvn/version "1.2.0"}  ; Thread pools for load testing
```

All other dependencies (criterium, clj-async-profiler, clj-memory-meter) already present in `:dev` alias.

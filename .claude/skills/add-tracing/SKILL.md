--b-
name: add-tracing
description: Add OpenTelemetry tracing spans to Clojure code following Metabase tracing conventions. Use when instrumenting backend code with trace coverage.
---

# Add Tracing Spans to Clojure Code

This skill helps you add OpenTelemetry (OTel) tracing spans to the Metabase backend codebase using the custom `tracing/with-span` macro.

## Reference Files

- `src/metabase/tracing/core.clj` - The `with-span` macro, group registry, SDK lifecycle, and Pyroscope integration
- `src/metabase/tracing/attributes.clj` - Standard attribute builders and `sanitize-sql`
- `src/metabase/task/impl.clj` - `defjob` macro that wraps Quartz jobs with root spans
- `.clj-kondo/config/modules/config.edn` - Module boundary configuration

## Module Architecture

The tracing module has a deliberately minimal API surface. **Only 3 namespaces are public** (listed in `:api` in the module config):

| Namespace | Role | Status |
|---|---|---|
| `tracing.core` | Primary API: `with-span`, groups, SDK lifecycle, Pyroscope, MDC | **Public API** |
| `tracing.attributes` | Attribute builders: `sanitize-sql`, `query-attrs`, etc. | **Public API** |
| `tracing.init` | Side-effect loader for `quartz` and `settings` | **Public API** (init convention) |
| `tracing.settings` | Setting definitions (`MB_TRACING_*` env vars) | Internal |
| `tracing.quartz` | Quartz JDBC proxy + JobListener | Internal |

**Rules:**
- **Do NOT add new API namespaces** to the tracing module. Add new public functions to `tracing.core` or `tracing.attributes` instead.
- **Do NOT require internal namespaces** (`tracing.settings`, `tracing.quartz`) from outside the tracing module. They are loaded via `tracing.init` for side effects only.
- Even the `core` module (which has `:uses :any`) cannot require non-API namespaces from other modules — `:uses :any` bypasses the consumer's restriction but NOT the target module's `:api` check.

### Cyclic Dependency Avoidance

`tracing/core.clj` is required by many modules across the codebase. It **must NOT** compile-time require heavy dependencies like `tracing.settings` or the OTel SDK, as this creates transitive cyclic load dependencies (e.g., `settings/core -> tracing/settings -> tracing/core -> events/impl -> events/core`).

Instead, `tracing/core.clj` uses `requiring-resolve` for all settings and SDK access:

```clojure
;; CORRECT — lazy runtime resolution, no compile-time dependency
((requiring-resolve 'metabase.tracing.settings/tracing-enabled))

;; WRONG — creates cyclic load dependency
(require '[metabase.tracing.settings :as settings])
(settings/tracing-enabled)
```

**Important:** `requiring-resolve` must use **literal quoted symbols**. Kondo hooks validate that `required-namespaces` are all simple symbols, so dynamic construction fails:

```clojure
;; CORRECT — literal quoted symbol
(requiring-resolve 'metabase.tracing.settings/tracing-endpoint)

;; WRONG — kondo hook rejects this: "Assert failed: (every? simple-symbol? required-namespaces)"
(requiring-resolve (symbol "metabase.tracing.settings" "tracing-endpoint"))
```

## Quick Checklist

When adding tracing spans:

- [ ] Module has `tracing` in its `:uses` set in `.clj-kondo/config/modules/config.edn`
- [ ] Added `[metabase.tracing.core :as tracing]` to ns requires (alphabetically sorted)
- [ ] Span wraps a meaningful I/O boundary (not pure computation)
- [ ] Group matches the domain (check `src/metabase/tracing/core.clj` for registered groups; add a new one if none fit)
- [ ] Span name follows dot-notation convention (`"domain.subsystem.operation"`)
- [ ] Attributes use namespaced keywords (`:search/query-length`, `:db/id`)
- [ ] No sensitive data in attributes (use `sanitize-sql` for HoneySQL, never raw SQL)
- [ ] No new tracing namespaces created (add to `tracing.core` or `tracing.attributes` instead)
- [ ] No `DO_NOT_ADD_NEW_FILES_HERE.txt` violations in the target directory
- [ ] Run `clj-kondo --lint <files>` to verify 0 errors, 0 warnings
- [ ] Add or update tests in the corresponding `test/` path (see Testing section below)
- [ ] Run tests: `clojure -X:dev:test :only <test-ns>`

## The `with-span` Macro

```clojure
(tracing/with-span group span-name attrs & body)
```

- **group** - A keyword selecting which trace group this span belongs to (e.g., `:tasks`, `:sync`)
- **span-name** - A string identifying the span in traces (e.g., `"search.execute"`)
- **attrs** - A map of span attributes (e.g., `{:db/id 42}`)
- **body** - The code to execute inside the span

**When disabled:** zero overhead -- single atom deref + boolean check, body runs directly.
**When enabled:** creates OTel span AND injects `trace_id`/`span_id` into Log4j2 MDC for log-to-trace correlation.

## Trace Groups

Groups are registered in `src/metabase/tracing/core.clj`. Check that file for the current list. The general rule: **match the group to the domain, not the call site.** If code runs inside a Quartz job but is logically search work, use `:search`, not `:tasks`.

To add a new group:

```clojure
;; In src/metabase/tracing/core.clj
(register-group! :my-domain "Description of what this covers")
```

Users enable groups via `MB_TRACING_GROUPS=tasks,search,sync` (comma-separated, or `"all"`).

## Naming Conventions

### Span Names

Use dot-separated hierarchical names: `"domain.subsystem.operation"`. The domain prefix should match the group name:

```
search.execute              -- `:search` group
sync.fingerprint.table      -- `:sync` group
task.session-cleanup.delete -- `:tasks` group
db-app.collection-items     -- `:db-app` group
```

### Attributes

Use namespaced keywords. The namespace groups related attributes:

```clojure
:db/id              -- Database ID (integer)
:db/engine          -- Database engine name (string)
:db/statement       -- Sanitized SQL (string, via sanitize-sql)
:search/engine      -- Search engine name (string)
:search/query-length -- Query string length (integer)
:sync/table         -- Table name (string)
:sync/step          -- Sync step name (string)
:task/name          -- Task name (string)
:http/method        -- HTTP method (string)
:http/url           -- Request URL (string)
```

Invent new namespaced attributes as needed (e.g., `:pulse/id`, `:transform/count`). Keep values as primitives (strings, numbers, booleans) -- no maps or collections.

## Step-by-Step: Adding a Span

### 1. Check module boundaries

Look up the module for your namespace in `.clj-kondo/config/modules/config.edn`. If `tracing` is not in the module's `:uses` set, add it (keep alphabetically sorted):

```edn
my-module
{:team "MyTeam"
 :uses #{analytics config tracing util}}
```

### 2. Add the require

```clojure
(ns metabase.my-module.thing
  (:require
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]))
```

If using `sanitize-sql`, also add `[metabase.tracing.attributes :as trace-attrs]`.

### 3. Identify the I/O boundary

Only wrap code at **meaningful I/O boundaries**:

**DO trace:**
- External API calls (embedding APIs, metabot, webhooks)
- Database queries (both app DB and user DB)
- Network requests (HTTP calls to external services)
- Heavy batch processing (batch indexing, batch embedding)
- Top-level orchestration functions that coordinate multiple sub-operations

**DO NOT trace:**
- Pure computation (sorting, filtering, mapping)
- Simple single-row lookups (`t2/select-one :model/Setting :key k`)
- Every function in a call chain (only boundaries matter)
- Trivial operations (string formatting, hash calculations)

### 4. Wrap with `with-span`

```clojure
;; Simple span (no attributes needed)
(tracing/with-span :search "search.init-index" {}
  (do-expensive-thing))

;; Span with static attributes
(tracing/with-span :sync "sync.fingerprint.table"
                   {:db/id (:db_id table)
                    :sync/table (:name table)}
  (fingerprint-fields! table fields))

;; Span with computed attributes
(tracing/with-span :search "search.execute"
                   {:search/engine       (name (:search-engine ctx))
                    :search/query-length (count (:search-string ctx))}
  (search.engine/results ctx))

;; Span with sanitized SQL (for dynamic HoneySQL queries)
(let [hsql {:delete-from [(t2/table-name :model/Session)]
            :where [:< :created_at oldest-allowed]}]
  (tracing/with-span :tasks "task.session-cleanup.delete"
                     {:db/statement (trace-attrs/sanitize-sql hsql)}
    (t2/query-one hsql)))

;; Sub-spans breaking a function into I/O phases
(let [embedding (tracing/with-span :search "search.semantic.embedding"
                                   {:search.semantic/provider (:provider model)}
                  (get-embedding model search-string))
      results   (tracing/with-span :search "search.semantic.db-query" {}
                  (into [] xform reducible))]
  (process results))

;; Per-item iteration spans
(doseq [e (search.engine/active-engines)]
  (tracing/with-span :search "search.ingestion.update" {:search/engine (name e)}
    (search.engine/update! e batch)))
```

### 5. Add tests

Create or update tests in the corresponding `test/` path. Follow the patterns in existing tracing tests:

- **Reference tests:** `test/metabase/tracing/quartz_test.clj`, `test/metabase/server/middleware/trace_test.clj`
- Use `tracing/init-enabled-groups!` / `tracing/shutdown-groups!` with `try`/`finally` to manage group lifecycle
- Test both enabled and disabled paths (verify zero overhead when group is off)
- Use `reify` mocks for Java interfaces (Connection, PreparedStatement, JobListener, etc.)
- Add `(set! *warn-on-reflection* true)` and type-hint proxy/reify calls to avoid reflection warnings

```clojure
(deftest my-span-enabled-test
  (testing "when group is enabled, span is created"
    (try
      (tracing/init-enabled-groups! "my-group" "INFO")
      ;; ... test that span behavior occurs ...
      (finally
        (tracing/shutdown-groups!)))))

(deftest my-span-disabled-test
  (testing "when group is disabled, code runs without tracing"
    (tracing/shutdown-groups!)
    ;; ... test that code still works, no wrapping applied ...
    ))
```

### 6. Lint and run tests

```bash
# Lint modified source and test files — expect 0 errors, 0 warnings
clj-kondo --lint path/to/modified/file.clj path/to/test/file.clj

# Run tests (requires Java 21+)
  clojure -X:dev:test :only my-ns.test-ns
```

Expect: all tests pass, 0 failures, 0 errors, no reflection warnings from your files.

## Sanitizing SQL for Attributes

When including SQL in span attributes, **always** use `trace-attrs/sanitize-sql`. This converts HoneySQL maps to parameterized SQL strings where values become `?` placeholders -- no data leaks.

```clojure
(let [hsql {:delete-from [:core_session]
            :where [:< :created_at some-timestamp]}]
  (tracing/with-span :tasks "task.cleanup.delete"
                     {:db/statement (trace-attrs/sanitize-sql hsql)}
    (t2/query-one hsql)))
;; Trace attribute: db/statement = "DELETE FROM core_session WHERE created_at < ?"
```

**Rules:**
- Never put raw SQL strings or user-provided values in attributes
- Use `sanitize-sql` only for app DB (HoneySQL) queries
- For external/user DB queries, trace only timing and counts, not SQL content

## Standard Attribute Builders

`metabase.tracing.attributes` provides helpers for common attribute patterns:

```clojure
(trace-attrs/query-attrs {:database-id 1 :database-engine :postgres :query-type :native})
(trace-attrs/sync-attrs {:database-id 1 :phase :metadata :table-name "users"})
(trace-attrs/task-attrs {:task-name "SessionCleanup"})
(trace-attrs/http-attrs {:method :get :uri "/api/card/1" :status 200})
```

Use these when they fit. For domain-specific attributes, use inline maps.

## Defjob and Root Spans

The `defjob` macro in `metabase.task.impl` automatically wraps every Quartz job with a `:tasks` root span:

```clojure
(task/defjob ^{DisallowConcurrentExecution true} SessionCleanup [_]
  (cleanup-sessions!))
;; Automatically creates span: "task.SessionCleanup" {:task/name "SessionCleanup"}
```

You do NOT need a root span inside `defjob` bodies. Add **child spans** for I/O inside the job.

For code on plain `Thread`s (not Quartz), add the root span manually:

```clojure
(defn init! []
  (tracing/with-span :search "search.task.init" {}
    (search/init-index!)))
```

## What NOT to Do

### Span Usage Mistakes

```clojure
;; WRONG - pure computation, no I/O
(tracing/with-span :search "search.format-results" {}
  (map format-result results))

;; WRONG - trivial single-row lookup
(tracing/with-span :db-app "db-app.get-setting" {}
  (t2/select-one :model/Setting :key "my-setting"))

;; WRONG - raw SQL in attributes (data leak)
(tracing/with-span :tasks "task.cleanup" {:db/statement raw-sql-string}
  (execute! raw-sql-string))

;; WRONG - wrong group (search work should use :search, not :tasks)
(tracing/with-span :tasks "search.execute" {} ...)

;; WRONG - redundant nesting (do-search already has a span)
(tracing/with-span :search "search.process" {}
  (let [results (do-search ctx)]
    (tracing/with-span :search "search.format" {}
      (format-results results))))
```

### Architecture Mistakes

```clojure
;; WRONG - creating a new tracing namespace for your feature
;; Instead, add public functions to tracing.core or tracing.attributes
(ns metabase.tracing.my-feature ...)

;; WRONG - requiring internal tracing namespaces from outside the module
(ns metabase.my-module.thing
  (:require [metabase.tracing.settings :as tracing.settings]  ;; internal!
            [metabase.tracing.quartz :as tracing.quartz]))     ;; internal!

;; WRONG - adding compile-time requires to tracing/core.clj for settings or SDK
;; This creates cyclic load dependencies because tracing/core is widely required
(ns metabase.tracing.core
  (:require [metabase.tracing.settings :as settings]))  ;; causes cycle!

;; WRONG - dynamic symbol construction with requiring-resolve (kondo rejects it)
(requiring-resolve (symbol "metabase.tracing.settings" "tracing-enabled"))

;; WRONG - 3-step pattern
(pyroscope/set-profiling-context! span-id span-name)
(when (pyroscope/available?)
  (.setAttribute span "pyroscope.profile.id" span-id))
;; CORRECT — single call, availability checked internally:
(tracing/set-pyroscope-context! span span-id span-name)
```

## Configuration

All settings are env-var-only (defined in `src/metabase/tracing/settings.clj`):

```bash
# Core
MB_TRACING_ENABLED=true              # Enable tracing (default: false)
MB_TRACING_ENDPOINT=host:4317        # OTLP collector endpoint (default: http://localhost:4317)
MB_TRACING_PROTOCOL=http             # Export protocol: "grpc" or "http" (default: http)
MB_TRACING_GROUPS=tasks,search,sync  # Comma-separated groups or "all" (default: all)
MB_TRACING_SERVICE_NAME=metabase     # Service name in traces (default: hostname)
MB_TRACING_LOG_LEVEL=DEBUG           # Log threshold for traced threads: TRACE/DEBUG/INFO (default: INFO)

# Batch span processor tuning
MB_TRACING_MAX_QUEUE_SIZE=2048       # Max spans queued for export; drops when full (default: 2048)
MB_TRACING_EXPORT_TIMEOUT_MS=10000   # Max wait for batch export to complete (default: 10000)
MB_TRACING_SCHEDULE_DELAY_MS=5000    # Delay between consecutive batch exports (default: 5000)
```

---
name: add-tracing
description: Add OpenTelemetry tracing spans to Clojure code following Metabase tracing conventions. Use when instrumenting backend code with trace coverage.
---

# Add Tracing Spans to Clojure Code

This skill helps you add OpenTelemetry (OTel) tracing spans to the Metabase backend codebase using the custom `tracing/with-span` macro.

## Reference Files

- `src/metabase/tracing/core.clj` - The `with-span` macro, group registry, and built-in groups
- `src/metabase/tracing/attributes.clj` - Standard attribute builders and `sanitize-sql`
- `src/metabase/task/impl.clj` - `defjob` macro that wraps Quartz jobs with root spans
- `.clj-kondo/config/modules/config.edn` - Module boundary configuration

## Quick Checklist

When adding tracing spans:

- [ ] Module has `tracing` in its `:uses` set in `.clj-kondo/config/modules/config.edn`
- [ ] Added `[metabase.tracing.core :as tracing]` to ns requires (alphabetically sorted)
- [ ] Span wraps a meaningful I/O boundary (not pure computation)
- [ ] Group matches the domain (check `src/metabase/tracing/core.clj` for registered groups; add a new one if none fit)
- [ ] Span name follows dot-notation convention (`"domain.subsystem.operation"`)
- [ ] Attributes use namespaced keywords (`:search/query-length`, `:db/id`)
- [ ] No sensitive data in attributes (use `sanitize-sql` for HoneySQL, never raw SQL)
- [ ] Run `clj-kondo --lint <files>` to verify 0 errors, 0 warnings

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

### 5. Verify

```bash
clj-kondo --lint path/to/modified/file.clj
```

Expect: `errors: 0, warnings: 0`

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

## Configuration

```bash
MB_TRACING_ENABLED=true              # Enable tracing
MB_TRACING_ENDPOINT=host:4317        # OTel collector endpoint (gRPC)
MB_TRACING_GROUPS=tasks,search,sync  # Comma-separated groups (or "all")
MB_TRACING_SERVICE_NAME=metabase     # Service name in traces
MB_TRACING_LOG_LEVEL=DEBUG           # Lower log threshold for traced threads
```

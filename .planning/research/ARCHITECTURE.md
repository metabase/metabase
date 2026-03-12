# Architecture: Structured Query Logging Integration

**Domain:** Structured query logging for Metabase
**Researched:** 2026-03-12
**Confidence:** HIGH -- based on direct source code analysis of the relevant files

## Executive Summary

Structured query logging must integrate at two distinct layers of the Metabase backend: the Query Processor (QP) middleware pipeline for user-facing analytics queries, and the `metabase.app-db.query` namespace for internal application database queries. A critical finding is that Metabase already has a per-request UUID (`metabase.config.core/*request-id*`) bound by Ring middleware, plus Log4j2 `ThreadContext` support via `metabase.util.log/with-thread-context`. These existing mechanisms provide the correlation ID and structured context propagation needed without inventing new infrastructure.

## Recommended Architecture

### Overview

```
HTTP Request
  |
  v
Ring Middleware (binds *request-id*)
  |
  v
[NEW] Query Log Context Middleware (pushes request-id + metadata to ThreadContext)
  |
  v
QP around-middleware: process-userland-query (has card-id, dashboard-id, user-id, etc.)
  |
  v
QP core: preprocess -> compile -> execute
  |                      |           |
  |                      |           v
  |                      |    [NEW] Logging wrapper around JDBC execute
  |                      |    (per-statement DEBUG log with SQL, params, timing)
  |                      |
  |                      v
  |               [SQL available here as :qp/compiled]
  |
  v
[NEW] Summary log line (INFO) in process-userland-query completing arity
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Query Log Context** (new namespace: `metabase.query-processor.middleware.query-log`) | Push correlation ID + query metadata into Log4j2 ThreadContext; emit INFO summary on completion | Ring request context, QP around-middleware layer |
| **JDBC Statement Logger** (new fn in or alongside `metabase.driver.sql-jdbc.execute`) | Emit DEBUG log line for each SQL statement with SQL text, params, timing, database-id | JDBC execute layer, ThreadContext (reads request-id) |
| **App DB Query Logger** (enhancement to `metabase.app-db.query`) | Emit DEBUG log line for each app-db SQL statement | Existing `compile` and `query` functions |
| **Logging Presets** (enhancement to `metabase.logger.api/presets`) | Two new presets: "Analytics query logging" and "App DB query logging" | Logger preset system |

### Data Flow

**Analytics Query (user-facing):**

1. HTTP request arrives, `wrap-request-id` binds `*request-id*` (UUID) to dynamic var and assocs `:request-id` to Ring request map.
2. The QP around-middleware pipeline is entered. `process-userland-query-middleware` already extracts `execution-info` containing: `card_id`, `dashboard_id`, `executor_id`, `database_id`, `context`, `query-hash`, `started_at`.
3. **[NEW]** A new around-middleware (positioned just inside `process-userland-query-middleware`) uses `log/with-thread-context` to push `{:request-id *request-id*, :database-id ..., :card-id ..., :user-id ...}` into the Log4j2 ThreadContext for the duration of the query.
4. The query is preprocessed, compiled (SQL now available as `:qp/compiled`), and dispatched to execution.
5. **[NEW]** In the JDBC execution path (`execute-reducible-query`), a wrapper logs each SQL statement at DEBUG level with: the SQL text, parameters, and individual execution time. The ThreadContext already contains the request-id from step 3, so every log line is automatically correlated.
6. **[NEW]** When the query completes (in the completing arity of the reducing function, similar to how `add-and-save-execution-metadata-xform!` works), a summary INFO log line is emitted with: request-id, card-id, dashboard-id, database-id, query count, total execution time, user-id, query type, cache hit status.

**App DB Query:**

1. `metabase.app-db.query/query` already has access to compiled SQL via its `compile` method.
2. **[NEW]** The existing `compile` method (which already does `log/tracef` for compiled SQL) gets enhanced: at DEBUG level, log the SQL and params. The `*request-id*` dynamic var is still in scope from the Ring middleware, so app-db queries executed during a request are automatically correlated.

## Integration Points (Specific Files and Locations)

### 1. Correlation ID: `metabase.config.core/*request-id*`

**Status:** Already exists and is production-ready.

- Defined in `src/metabase/config/core.clj` line 205 as `(def ^:dynamic *request-id* nil)`
- Bound per-request in `src/metabase/server/middleware/request_id.clj` via `(binding [*request-id* (random-uuid)] ...)`
- Applied early in the Ring middleware chain (`src/metabase/server/handler.clj` line 97)
- Available throughout the entire request lifecycle including QP execution

**Key advantage:** No new ID needed. This UUID is already unique per HTTP request and is in scope during all query processing.

**Limitation:** For non-HTTP-triggered queries (e.g., scheduled pulses/subscriptions via Quartz), `*request-id*` will be nil. The logging code should generate a fallback UUID in these cases, or use `query-hash` as an alternative correlation key.

### 2. Summary Log Line: `metabase.query-processor.middleware.process-userland-query`

**File:** `src/metabase/query_processor/middleware/process_userland_query.clj`

**Why here:** This middleware already:
- Determines whether a query is "userland" (line 178: `qp.util/userland-query?`)
- Extracts all the metadata we need via `query-execution-info` (lines 123-158): `database_id`, `executor_id`, `card_id`, `dashboard_id`, `context`, `query-hash`, `started_at`, `native` (query type)
- Tracks execution time via `start_time_millis` and `add-running-time`
- Has a completing arity in `add-and-save-execution-metadata-xform!` (lines 100-121) that fires exactly once when the query finishes

**Integration approach:** Add the summary INFO log line in the completing arity of `add-and-save-execution-metadata-xform!`, right alongside the existing `save-successful-execution-metadata!` call. This gives us access to `execution-info` (all metadata) and `@row-count` (result rows).

Alternatively, create a **separate around-middleware** to keep concerns cleanly separated. This middleware would sit adjacent to `process-userland-query-middleware` in the `around-middleware` vector in `src/metabase/query_processor.clj` (line 25).

**Recommendation:** Separate middleware. It keeps the logging concern isolated and testable, and avoids further complicating `process-userland-query-middleware` which already does several things.

### 3. Per-Statement DEBUG Log: `metabase.driver.sql-jdbc.execute`

**File:** `src/metabase/driver/sql_jdbc/execute.clj`

**Why here:** The `execute-reducible-query` function (line 771) is the single point where all SQL/JDBC queries are actually sent to the database. It has access to:
- `sql` -- the final SQL string (line 774, after remark injection)
- `params` -- query parameters (line 774)
- `driver` -- the database driver (line 773)
- `outer-query` -- the full query map including `:info` with card-id etc.

**Integration approach:** Wrap the actual statement execution (lines 789-799, the `execute-statement-or-prepared-statement!` call) with timing, then emit a DEBUG log line with:
- SQL text (already available as `sql`)
- Parameters (already available as `params`)
- Execution time (measure around the execute call)
- Database ID (available from `(driver-api/database ...)`)

The ThreadContext will already contain `request-id` from the upstream middleware, providing automatic correlation.

**Important detail:** The remark injection on line 778 already adds a SQL comment with `userID`, `queryType`, and `queryHash` to the SQL string. The structured log captures the SQL after this injection, so the remark is included. This is good -- it means the logged SQL matches what the database actually receives.

### 4. App DB Logging: `metabase.app-db.query`

**File:** `src/metabase/app_db/query.clj`

**Current state:** Already has `log/tracef` on line 118 that logs compiled SQL and parameters at TRACE level. This is too verbose for production use.

**Integration approach:** Add a DEBUG-level log line in the `query` function (line 124) that logs the compiled SQL and parameters. This should use a dedicated logger namespace (e.g., the existing namespace or a sub-namespace) so it can be independently controlled via the preset system.

### 5. Logging Presets: `metabase.logger.api`

**File:** `src/metabase/logger/api.clj`

**Current state:** Has three presets defined in the `presets` function (line 54): `:sync`, `:linkedfilters`, `:serialization`. Each preset is a map with `:id`, `:display_name`, and `:loggers` (a list of namespace/level pairs).

**Integration approach:** Add two new presets:

```clojure
{:id :analytics-query-logging
 :display_name (tru "Analytics query logging")
 :loggers [{:name "metabase.query-processor.middleware.query-log" :level :debug}
           {:name "metabase.driver.sql-jdbc.execute" :level :debug}]}

{:id :app-db-query-logging
 :display_name (tru "Application database query logging")
 :loggers [{:name "metabase.app-db.query" :level :debug}]}
```

**Note:** The summary log line should be at INFO level under the new query-log namespace, so it is visible even without activating the preset. The preset activates DEBUG level to get per-statement detail.

### 6. ThreadContext for Structured Context: `metabase.util.log`

**File:** `src/metabase/util/log.clj`

**Existing capability:** `with-thread-context` macro (line 94) pushes key-value pairs into Log4j2's `ThreadContext` (MDC). Keys are automatically prefixed with `mb-`. This means if we do:

```clojure
(log/with-thread-context {:request-id request-id, :database-id db-id}
  ...)
```

The ThreadContext will contain `mb-request-id` and `mb-database-id`, which are available to any Log4j2 appender/pattern layout that references `%X{mb-request-id}`.

**Important:** ThreadContext is thread-local. Since the QP executes queries synchronously on the request thread (the `*run*` -> `*execute*` -> `*reduce*` pipeline in `qp.pipeline` is synchronous), the ThreadContext values set at the around-middleware level will be available all the way down through JDBC execution.

**Caveat:** The `save-execution-metadata!` function in `process-userland-query` deliberately runs asynchronously via `qp.util/with-execute-async` (using `Agent/pooledExecutor`), which means ThreadContext values will NOT be available there. This is fine because our summary log line should be emitted synchronously, not in the async save path.

## Existing IDs Available in the QP Pipeline

| ID | Where | Type | Scope | Suitability as Correlation ID |
|----|-------|------|-------|-------------------------------|
| `*request-id*` | `metabase.config.core` dynamic var, bound by Ring middleware | UUID | Per HTTP request | **Best choice** -- unique per request, already exists, in scope during all query processing |
| `query-hash` | `[:info :query-hash]` on query map, computed in `process-userland-query-middleware` | byte array (SHA-256) | Per unique query shape | Not suitable alone -- same hash for identical queries across different requests |
| `executed-by` | `[:info :executed-by]` on query map | User ID (integer) | Per user | Not a correlation ID, but useful metadata |
| `card-id` | `[:info :card-id]` on query map | Card ID (integer) | Per saved question | Not a correlation ID, but useful metadata |
| `dashboard-id` | `[:info :dashboard-id]` on query map | Dashboard ID (integer) | Per dashboard | Not a correlation ID, but useful metadata |
| `context` | `[:info :context]` on query map | Keyword enum | Per execution context type | Useful metadata (`:ad-hoc`, `:dashboard`, `:question`, etc.) |

**Recommendation:** Use `*request-id*` as the primary correlation ID. For non-HTTP contexts (pulses, sync), generate a UUID at the point of entry and bind it to `*request-id*` so the same correlation mechanism works everywhere.

## Patterns to Follow

### Pattern 1: Around Middleware for Cross-Cutting Concerns

**What:** The QP uses an around-middleware pattern where each middleware wraps the next in the chain. The `around-middleware` vector in `metabase.query-processor` defines the outermost wrappers.

**When:** For any concern that needs to wrap the full query lifecycle (pre-processing through post-processing).

**Example from codebase:**
```clojure
;; From metabase.query-processor line 25
(def around-middleware
  [#'qp.middleware.enterprise/handle-audit-app-internal-queries-middleware
   #'qp.process-userland-query/process-userland-query-middleware
   #'qp.catch-exceptions/catch-exceptions])
```

**For query logging:** Add the new logging middleware to this vector, positioned just inside `process-userland-query-middleware` (so it has access to the userland query info but runs after the try/catch setup).

### Pattern 2: Dynamic Vars for Request-Scoped State

**What:** Metabase uses Clojure dynamic vars extensively for request-scoped state: `*request-id*`, `driver/*driver*`, `qp.pipeline/*canceled-chan*`, etc.

**When:** For state that needs to be available deep in the call stack without explicit parameter passing.

**For query logging:** `*request-id*` is already available. No new dynamic vars needed unless we want to track per-query-within-request state (e.g., a query counter), which can be handled with a simple atom in the middleware closure.

### Pattern 3: Log4j2 ThreadContext (MDC) for Structured Log Context

**What:** `log/with-thread-context` pushes key-value pairs into Log4j2's MDC, making them available to all log statements within the dynamic scope.

**When:** For adding contextual metadata to log lines without modifying every log call site.

**For query logging:** Push `request-id`, `database-id`, `card-id`, `user-id` into ThreadContext at the around-middleware level. All log lines (including the per-statement DEBUG lines in the JDBC layer) will automatically include these values if the log pattern references them.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Modifying the JDBC Execute Multimethod Dispatch

**What:** Overriding `execute-reducible-query` or `execute-prepared-statement!` via multimethod dispatch to add logging.

**Why bad:** Every SQL/JDBC driver inherits from `:sql-jdbc`. Overriding these multimethods would either affect all drivers or require per-driver overrides. It also makes the logging invisible in the source code of `execute.clj`.

**Instead:** Add logging as a wrapper within the existing `execute-reducible-query` function body, around the `execute-statement-or-prepared-statement!` call.

### Anti-Pattern 2: Creating a New ID When `*request-id*` Exists

**What:** Generating a new "query execution ID" or "trace ID" for correlation.

**Why bad:** Adds unnecessary complexity. `*request-id*` is already unique per request and is bound at the right scope. Introducing a second ID creates confusion about which to use and when.

**Instead:** Reuse `*request-id*`. For the edge case of non-HTTP contexts, bind `*request-id*` at the entry point (e.g., in pulse/subscription execution code).

### Anti-Pattern 3: Logging in the Async Save Path

**What:** Emitting the summary log line inside `save-execution-metadata!` which runs on `Agent/pooledExecutor`.

**Why bad:** ThreadContext values are thread-local and will not be propagated to the async thread. The log line would lack correlation context.

**Instead:** Emit the summary log line synchronously in the completing arity of the reducing function, before the async save is triggered.

## Build Order (Dependencies Between Components)

The components should be built in this order due to dependencies:

### Phase 1: ThreadContext Foundation + Summary Log Line

**Build:** New around-middleware (`metabase.query-processor.middleware.query-log`) that:
1. Reads `*request-id*` and query `:info` metadata
2. Pushes them into ThreadContext via `log/with-thread-context`
3. Tracks timing
4. Emits INFO summary log line on completion

**Why first:** This establishes the correlation ID propagation that all subsequent components depend on. The summary log line alone (without per-statement detail) provides immediate value.

**Dependencies:** None beyond existing infrastructure.

### Phase 2: Per-Statement JDBC Logging

**Build:** Logging wrapper in `metabase.driver.sql-jdbc.execute/execute-reducible-query` that emits DEBUG log lines for each SQL statement.

**Why second:** Depends on Phase 1 for ThreadContext to contain the correlation ID. Without Phase 1, the per-statement logs would have no way to correlate with a request.

**Dependencies:** Phase 1 (ThreadContext propagation).

### Phase 3: App DB Logging

**Build:** Enhanced logging in `metabase.app-db.query/query` at DEBUG level.

**Why third:** Independent of Phase 2 but benefits from Phase 1's ThreadContext propagation for request-id correlation. Lower priority because app-db queries are less frequently the target of debugging.

**Dependencies:** Phase 1 (ThreadContext propagation).

### Phase 4: Logging Presets

**Build:** Two new presets in `metabase.logger.api/presets`.

**Why last:** Presets are the user-facing control mechanism. They should be added after the underlying logging is in place so they can be tested end-to-end.

**Dependencies:** Phases 1-3 (the namespaces the presets control must exist).

## Concurrency Considerations

1. **ThreadContext is thread-local:** This is safe for the synchronous QP pipeline. Each request runs on its own thread, so ThreadContext values don't leak between requests.

2. **`*request-id*` is a dynamic var:** Correctly scoped per-thread via `binding`. Safe under concurrency.

3. **Dashboard queries:** A dashboard load may trigger multiple QP executions in parallel (one per card). Each runs on a separate thread. If `*request-id*` is not propagated to these threads, they will lack correlation. Need to verify how dashboard parallel execution works and whether dynamic vars are propagated.

4. **Atom-based query counter:** If tracking "query N of M" within a request, use a shared atom created in the around-middleware. Atoms are thread-safe, so concurrent queries within the same request can safely increment.

## Log Format Specification

Using Metabase's standard log format (not JSON/KV). Example log lines:

**INFO summary (always on):**
```
2026-03-12 10:15:32 INFO query-log :: request-id=abc-123 user=5 database=2 card=42 dashboard=7 context=dashboard queries=1 rows=150 time=234ms cache=miss
```

**DEBUG per-statement (when preset active):**
```
2026-03-12 10:15:32 DEBUG query-log :: request-id=abc-123 database=2 SQL: SELECT "PUBLIC"."ORDERS"."ID" ... LIMIT 2000 params=[1, "active"] time=230ms
```

The exact format should match Metabase's existing log conventions. The ThreadContext values (`mb-request-id`, etc.) will be available to the log pattern layout for structured output if desired.

## Sources

All findings are from direct source code analysis:
- `src/metabase/config/core.clj` -- `*request-id*` definition
- `src/metabase/server/middleware/request_id.clj` -- request ID binding
- `src/metabase/server/handler.clj` -- middleware chain ordering
- `src/metabase/query_processor.clj` -- around-middleware, process-query flow
- `src/metabase/query_processor/middleware/process_userland_query.clj` -- userland query lifecycle
- `src/metabase/query_processor/pipeline.clj` -- *execute*, *run*, *reduce* dynamic pipeline
- `src/metabase/query_processor/execute.clj` -- execution middleware chain
- `src/metabase/query_processor/compile.clj` -- SQL compilation
- `src/metabase/query_processor/setup.clj` -- QP setup middleware
- `src/metabase/driver/sql_jdbc/execute.clj` -- JDBC execution, `execute-reducible-query`
- `src/metabase/driver/sql_jdbc/execute/diagnostic.clj` -- existing diagnostic pattern
- `src/metabase/app_db/query.clj` -- app DB query execution
- `src/metabase/logger/api.clj` -- logging presets
- `src/metabase/logger/core.clj` -- logger infrastructure
- `src/metabase/util/log.clj` -- `with-thread-context`, ThreadContext support
- `src/metabase/lib/schema/info.cljc` -- query `:info` schema
- `src/metabase/query_processor/util.clj` -- query-hash, remark generation

---

*Architecture analysis: 2026-03-12*

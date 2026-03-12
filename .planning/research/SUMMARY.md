# Project Research Summary

**Project:** Structured Query Logging
**Domain:** Application-level database query logging for a Clojure/JVM BI tool
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

Structured query logging for Metabase is an implementation-only project with no new dependencies. The entire infrastructure already exists: Log4j2 with ThreadContext (MDC) support, a `with-thread-context` Clojure macro, a per-request UUID (`*request-id*`), a runtime log-level preset system with admin UI, and a `%notEmpty{%X}` log pattern that automatically renders MDC values. The work is to wire these existing pieces together at two integration points: the Query Processor middleware pipeline (for user-facing analytics queries) and `metabase.app-db.query` (for internal application database queries).

The recommended approach is a four-phase build: (1) establish correlation ID propagation via ThreadContext and emit an always-on INFO summary line per request, (2) add per-statement DEBUG logging in the JDBC execution layer, (3) add app DB query logging, and (4) define logging presets that activate the new namespaces through the existing admin UI. This order follows a strict dependency chain -- downstream phases depend on the ThreadContext infrastructure from phase 1.

The primary risks are thread-safety concerns around MDC: context leaking between requests on pooled threads, dynamic var bindings lost across async boundaries, and the format change that adding MDC keys to all log lines represents. All are well-understood JVM patterns with known solutions (clear MDC in `finally` blocks, copy MDC when crossing thread boundaries, document the format change in release notes). A secondary risk is performance: the always-on INFO summary line must be benchmarked under load to ensure sub-0.1ms overhead per query.

## Key Findings

### Recommended Stack

No new dependencies. Metabase already has Log4j2 2.25.x, clojure.tools.logging 1.3.0, SLF4J 2.0.17, and all necessary infrastructure. The `metabase.util.log/with-thread-context` macro wraps Log4j2's `ThreadContext` for structured context propagation. The log pattern in `log4j2.xml` already includes `%notEmpty{%X}` which renders all ThreadContext values automatically.

**Core technologies (all existing):**
- **Log4j2 ThreadContext** -- per-thread structured context (MDC) for correlation IDs and query metadata
- **`metabase.util.log/with-thread-context`** -- Clojure macro that manages ThreadContext lifecycle with automatic `mb-` key prefixing
- **`metabase.config.core/*request-id*`** -- per-request UUID, already bound by Ring middleware
- **`metabase.logger.api` preset system** -- runtime log-level control with auto-expiry, admin UI, and API endpoints
- **`%notEmpty{%X}` log pattern** -- existing pattern renders MDC values in standard text format without any configuration changes

**What NOT to add:** Logback, SLF4J MDC (use Log4j2 ThreadContext directly), Timbre, Cambium, Mulog, or any JSON/structured log format library. These would conflict with Metabase's existing logging stack.

### Expected Features

**Must have (table stakes):**
- Full SQL text in log output at DEBUG level
- Execution time per query
- Request-level correlation ID (reuse existing `*request-id*`)
- Runtime toggle without restart (existing preset system)
- INFO summary line per request (query count, total time, database, user)
- DEBUG per-statement lines (SQL, params, timing, database ID)
- Separate analytics vs app DB presets
- Parameter values in DEBUG output
- Database and user identification

**Should have (differentiators):**
- Card/Dashboard attribution in log lines (unique to Metabase, low complexity)
- Query type classification (user vs sync vs pulse -- medium complexity)
- Query count per request in summary line
- Row count in summary line

**Defer (v2+):**
- Data masking/redaction -- explicitly out of scope
- Non-JDBC driver support (BigQuery, MongoDB, Druid)
- Query plan / EXPLAIN logging
- SQLCommenter-style query annotation
- Persistent query log storage
- Slow query threshold alerting

### Architecture Approach

The architecture integrates at two layers: a new QP around-middleware (`metabase.query-processor.middleware.query-log`) for analytics queries, and an enhancement to `metabase.app-db.query` for internal queries. The around-middleware pushes correlation metadata into ThreadContext, tracks timing, and emits a summary INFO line on completion. A separate logging wrapper in `metabase.driver.sql-jdbc.execute` emits per-statement DEBUG lines. Two new presets in `metabase.logger.api` control activation.

**Major components:**
1. **Query Log Context Middleware** (new) -- pushes request-id, database-id, card-id, user-id into ThreadContext; emits INFO summary on completion
2. **JDBC Statement Logger** (new wrapper in existing namespace) -- emits DEBUG log per SQL statement with SQL text, params, timing
3. **App DB Query Logger** (enhancement) -- emits DEBUG log for app-db SQL statements
4. **Logging Presets** (two new entries) -- "Analytics query logging" and "App DB query logging" presets for the existing admin UI

**Key architectural decisions:**
- Use `*request-id*` as primary correlation ID, push into MDC at middleware level
- Emit summary INFO line synchronously in completing arity (NOT in async save path)
- Separate middleware for logging concern (do not further complicate `process-userland-query-middleware`)
- Generate fallback UUID for non-HTTP contexts (pulses, sync jobs)

### Critical Pitfalls

1. **MDC leaking between requests on pooled threads** -- ThreadContext persists on reused thread pool threads. Always clear MDC in `finally` blocks. Test with sequential requests on a single-threaded executor to verify no cross-contamination.

2. **Dynamic var `*request-id*` lost across async boundaries** -- `save-execution-metadata!` uses `Agent/pooledExecutor` without `bound-fn`; `core.async` go blocks do not convey bindings. Mitigation: use MDC for logging correlation (set from `*request-id*` at middleware level), and explicitly copy MDC when crossing thread boundaries.

3. **SQL parameter values containing PII** -- Parameters logged at DEBUG level may contain names, emails, or other sensitive data. Mitigation: parameters only at DEBUG (never INFO), document security implications in preset UI, gate behind explicit admin action.

4. **Performance overhead of always-on INFO summary** -- Must be sub-0.1ms per query. Pre-compute values during execution, use lazy log evaluation, benchmark under load before shipping.

5. **MDC changes affect ALL existing log lines** -- Adding request-id to ThreadContext means `%notEmpty{%X}` appends it to every log line in the system. Document as a feature in release notes, not a silent change.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Correlation ID Infrastructure and Summary Log Line
**Rationale:** Foundation for everything else. ThreadContext propagation must exist before any meaningful log lines can be added. The summary line alone delivers immediate value.
**Delivers:** Per-request correlation ID in ThreadContext; INFO-level summary line (request-id, user, database, card, dashboard, query count, time, rows); fallback UUID for non-HTTP contexts.
**Addresses:** Correlation ID, summary log line, database/user identification, card/dashboard attribution
**Avoids:** Pitfalls 1 (async propagation), 3 (MDC leaking), 4 (performance), 7 (ID mismatch), 8 (format change)

### Phase 2: Per-Statement JDBC Logging
**Rationale:** Depends on Phase 1 for ThreadContext correlation. This is the core "see what queries Metabase sends" feature.
**Delivers:** DEBUG-level log line per SQL statement with full SQL text, parameters, execution time, database ID. Automatically correlated via ThreadContext.
**Addresses:** Full SQL text, parameter values, execution time per statement
**Avoids:** Pitfalls 2 (PII in params -- gate behind DEBUG), 6 (pivot query confusion -- include card_id), 10 (large SQL formatting -- lazy evaluation)

### Phase 3: App DB Query Logging
**Rationale:** Independent of Phase 2 but benefits from Phase 1's ThreadContext. Lower priority because internal queries are less often the debugging target.
**Delivers:** DEBUG-level log lines for application database queries. Correlated to requests via ThreadContext.
**Addresses:** App DB visibility, separate from analytics queries
**Avoids:** Pitfall 9 (cross-contamination -- separate namespaces ensure clean separation)

### Phase 4: Logging Presets and Documentation
**Rationale:** Presets are the user-facing activation mechanism. They should be added after the underlying logging works so they can be tested end-to-end.
**Delivers:** Two new presets ("Analytics query logging", "App DB query logging") in admin UI. Documentation of security implications, volume expectations, and format changes.
**Addresses:** Runtime toggle, separate preset controls, auto-expiry for safety
**Avoids:** Pitfall 5 (volume explosion -- document expectations, leverage auto-expiry)

### Phase Ordering Rationale

- **Strict dependency chain:** Phases 2 and 3 require Phase 1's ThreadContext propagation to produce correlated log lines. Phase 4 requires Phases 1-3 to have the namespaces that presets control.
- **Value delivery:** Phase 1 alone delivers a useful always-on summary. Phases 2-3 add opt-in detail. Phase 4 makes it admin-friendly.
- **Risk front-loading:** The hardest problems (thread safety, MDC lifecycle, performance) are all in Phase 1. Getting this right makes subsequent phases straightforward.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Dashboard parallel query execution needs investigation -- how are dynamic vars propagated when multiple cards execute concurrently? The streaming response path uses `bound-fn` but dashboard card parallelism may use a different mechanism.
- **Phase 1:** Non-HTTP entry points (Quartz-scheduled pulses/subscriptions) need audit to determine where to bind fallback `*request-id*`.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Standard JDBC logging wrapper pattern. The integration point (`execute-reducible-query` in `sql_jdbc/execute.clj`) is well-documented in the architecture research.
- **Phase 3:** Minimal change to existing `metabase.app-db.query` -- upgrade existing TRACE log to DEBUG.
- **Phase 4:** Direct extension of existing preset system with two new map entries.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified directly in deps.edn and source code. Zero new dependencies. |
| Features | HIGH | Feature landscape based on industry standards (P6Spy, ProxySQL, Rails, Django) plus Metabase issue #49198 comments. Clear MVP prioritization. |
| Architecture | HIGH | All integration points verified by direct source code analysis. File paths, line numbers, and function signatures confirmed. |
| Pitfalls | HIGH | Thread-safety pitfalls based on verified code paths (async save, streaming thread pool, MDC semantics). JVM MDC behavior is well-established. |

**Overall confidence:** HIGH

### Gaps to Address

- **Dashboard parallel execution model:** How exactly are card queries parallelized during dashboard loads? Are dynamic vars and/or MDC propagated to those threads? Needs verification during Phase 1 implementation.
- **Non-HTTP entry points:** Which code paths trigger queries without an HTTP request (pulses, sync, subscriptions)? Where should fallback `*request-id*` be bound? Needs audit during Phase 1.
- **`bound-fn` vs MDC propagation:** `bound-fn` conveys dynamic vars but NOT MDC. The streaming response thread pool uses `bound-fn`. If we rely on MDC for logging, we need explicit MDC copying in the streaming response path. This interaction needs careful testing.
- **Performance baseline:** No benchmark data exists yet for the overhead of the summary log line. Must be measured during Phase 1 implementation. Target: <0.1ms per query.

## Sources

### Primary (HIGH confidence)
- Metabase source code (direct analysis): deps.edn, log4j2.xml, metabase.util.log, metabase.config.core, metabase.server.middleware.request-id, metabase.query-processor (middleware pipeline), metabase.driver.sql-jdbc.execute, metabase.app-db.query, metabase.logger.api, metabase.logger.core
- Log4j2 ThreadContext documentation (standard JVM pattern)
- Clojure dynamic var threading semantics (core language behavior)

### Secondary (MEDIUM confidence)
- Industry comparisons: ProxySQL query logging, PostgreSQL log_min_duration_statement, Rails ActiveRecord::QueryLogs, Django django.db.backends, P6Spy JDBC logging
- Metabase Issue #49198 (user requirements and feature requests)

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*

# Domain Pitfalls: Structured Query Logging in Metabase

**Domain:** Structured query logging in a high-concurrency Clojure/JVM application
**Researched:** 2026-03-12

## Critical Pitfalls

Mistakes that cause production incidents, data leaks, or require significant rework.

### Pitfall 1: Dynamic Var `*request-id*` Not Propagated to Async Execution Paths

**What goes wrong:** Metabase uses Clojure dynamic vars (`*request-id*` in `metabase.config.core`) for request correlation. Dynamic vars are thread-local. Metabase has multiple async execution paths where bindings can be lost:

1. **`save-execution-metadata!`** in `process_userland_query.clj` explicitly uses `Agent/pooledExecutor` via `with-execute-async` and deliberately does NOT use `bound-fn` (the code comment says this is intentional to avoid using closed DB connections). Any logging in this async path will have no `*request-id*`.

2. **Streaming response thread pool** (`streaming-response-thread-pool`) runs query execution on a separate thread. The `streaming-response` macro uses `bound-fn` which DOES convey bindings -- so `*request-id*` is available here. But this is fragile: any code path that submits work to a different executor without `bound-fn` will lose the correlation ID.

3. **`core.async` go blocks** do NOT convey dynamic bindings. Any query processing code that uses `a/go` or `a/thread` will lose `*request-id*`.

**Why it happens:** Dynamic vars are Clojure's mechanism for thread-local state. They are convenient but invisible -- there is no compile-time check that a binding will be present on a particular thread.

**Consequences:** Log lines from query execution appear without correlation IDs, making them impossible to correlate with the request summary. Worse, this may only manifest under load when the thread pool is actually used, not in single-threaded dev testing.

**Prevention:**
- Use MDC (Log4j2's `ThreadContext`) instead of or in addition to dynamic vars for log correlation. MDC is the standard JVM mechanism for this.
- If using MDC, set it in a middleware early in the Ring handler stack and clear it in a `finally` block.
- For the streaming response path: MDC must be explicitly copied when submitting tasks to the thread pool. The `bound-fn` conveys Clojure dynamic vars but NOT MDC.
- Write integration tests that verify correlation IDs appear in log output from async execution paths.

**Detection:** Grep log output for lines from the query execution namespace that lack the correlation ID. Run a load test with multiple concurrent requests and verify every query log line has a correlation ID.

**Phase:** Must be addressed in the first phase (correlation ID infrastructure), before any log lines are added.

---

### Pitfall 2: SQL Parameter Values Logged to Disk Containing PII or Secrets

**What goes wrong:** The DEBUG-level per-statement log lines include SQL parameters (bind values). These parameters can contain:
- User-entered search strings (PII: names, emails, SSNs)
- Values from dashboard filters (potentially sensitive business data)
- Authentication tokens or passwords if the connected database stores them

Once written to disk (or shipped to a log aggregator), this data is subject to retention policies, access controls, and compliance requirements the operator may not have anticipated.

**Why it happens:** Parameter logging is extremely useful for debugging. Developers naturally include it without thinking about what the parameters might contain in production. Metabase already has a `replace` pattern in `log4j2.xml` that redacts `:basic-auth` -- demonstrating awareness of this risk for HTTP auth, but SQL parameters are a much broader surface.

**Consequences:** Compliance violations (GDPR, HIPAA, PCI-DSS). Data leaks if log files are accessed by unauthorized parties or shipped to third-party log aggregators. Customer trust damage.

**Prevention:**
- Parameters are only logged at DEBUG level, which is off by default -- this is good. The preset system requires explicit admin action to enable.
- Document clearly in the preset UI and docs that enabling detailed query logging will log parameter values.
- The project explicitly defers data masking/redaction (see "Out of Scope" in PROJECT.md). This is acceptable for the initial implementation because DEBUG is opt-in, but the documentation must be explicit about the security implications.
- Do NOT log parameters at INFO level. The summary line must never include parameter values.

**Detection:** Review the log output format specification. Ensure parameter logging is gated behind DEBUG level and never appears at INFO.

**Phase:** Address documentation in the preset implementation phase. The architectural decision (params only at DEBUG) should be locked in during phase 1.

---

### Pitfall 3: MDC Context Leaking Between Requests on Thread Pool Threads

**What goes wrong:** If you use Log4j2 MDC (`ThreadContext`) for correlation IDs, thread pool threads are reused across requests. If MDC is not cleared after each request completes, the next request on that thread inherits stale MDC values from the previous request. This causes:
- Log lines attributed to the wrong request
- Phantom correlation IDs on background tasks that have no request context

This is especially dangerous because the existing `log4j2.xml` pattern includes `%notEmpty{%X}` which prints ALL MDC context. Any MDC key set and not cleared will appear in every subsequent log line on that thread.

**Why it happens:** The streaming response thread pool (`streaming-response-thread-pool`) is a fixed-size pool of 50 threads. Threads are reused. MDC is thread-local storage that persists until explicitly cleared.

**Consequences:** Incorrect correlation in log analysis. Debugging becomes actively misleading -- you follow a correlation ID and find log lines from a completely different request.

**Prevention:**
- Always clear MDC in a `finally` block, never rely on normal control flow.
- If setting MDC before submitting to the streaming response thread pool, use a wrapper that copies MDC to the new thread and clears it in `finally`:
  ```clojure
  (let [mdc-context (org.apache.logging.log4j.ThreadContext/getContext)]
    (.submit pool
      (fn []
        (try
          (org.apache.logging.log4j.ThreadContext/putAll mdc-context)
          (do-work)
          (finally
            (org.apache.logging.log4j.ThreadContext/clearAll))))))
  ```
- Prefer setting MDC at the middleware level (where Ring middleware already has a clear request boundary) rather than deep in the QP pipeline.
- Consider using `ThreadContext.CloseableThreadContext` (Log4j2 2.x) which auto-clears on close -- but verify it works correctly with Metabase's Log4j2 version.

**Detection:** In tests, run two requests sequentially on a single-threaded executor and verify the second request does not carry MDC from the first.

**Phase:** Must be addressed in the correlation ID infrastructure phase (phase 1). Get this wrong and all subsequent log lines are unreliable.

---

### Pitfall 4: Always-On INFO Summary Line Adds Measurable Latency

**What goes wrong:** The summary log line fires on every request at INFO level and is intended to be always-on. If the summary computation is not cheap, it adds latency to every single query. Metabase processes millions of queries per day for large deployments. Even 1ms per query across 1M queries/day is 16 minutes of cumulative latency.

Sources of hidden cost:
- String formatting and concatenation for the log message
- Accessing synchronized data structures to gather query counts or timing
- Log4j2 appender contention: the in-memory `metabase-appender` uses a `QueueUtils/synchronizedQueue` backed by a `CircularFifoQueue`. Under high concurrency, logging to this queue becomes a synchronization bottleneck.
- If the console appender does synchronous I/O to STDOUT, that can block the request thread.

**Why it happens:** Logging feels free because it is invisible to the developer. But under high concurrency, every log call that touches shared mutable state or does I/O is a potential bottleneck.

**Consequences:** p99 latency increases. Under heavy load, the synchronized queue in `metabase-appender` becomes a contention point. Customers report "Metabase got slower after upgrading" without understanding why.

**Prevention:**
- Keep the summary line computation pure and allocation-light. Pre-compute values during query execution, do not re-derive them at log time.
- Use `log/info` (not `log/infof`) with simple string concatenation or `str` -- avoid `format` which is slower.
- Actually, prefer the `clojure.tools.logging` pattern where the log macro checks `(log/enabled? :info)` before evaluating arguments. Metabase's `metabase.util.log` macros likely already do this -- verify.
- Benchmark the summary line under load: run a realistic query workload with and without the summary line and measure p50/p99 latency difference. The target should be <0.1ms overhead per query.
- Do NOT include the summary line in the synchronized `metabase-appender` ring buffer unless absolutely necessary. The ring buffer is for the admin UI log viewer -- query logs there would quickly flush out useful debugging info.

**Detection:** Load test with and without the logging code. Profile with JFR or async-profiler to check for lock contention on the log appender queue.

**Phase:** Design consideration in phase 1. Benchmark validation before shipping.

---

## Moderate Pitfalls

### Pitfall 5: Log Volume Explosion When DEBUG Preset Is Enabled

**What goes wrong:** A busy Metabase instance running 100 queries/second with the "Analytics query logging" preset enabled at DEBUG level would produce 100+ log lines/second (one per SQL statement, potentially more for pivot queries which decompose into multiple sub-queries). Over a troubleshooting session of 30 minutes, that is 180,000+ additional log lines.

This can:
- Fill disk (especially in containerized deployments with limited storage)
- Overwhelm log aggregators (CloudWatch, Datadog, Splunk) and trigger cost spikes
- Push useful log lines out of the in-memory ring buffer (max 250 entries in `metabase-appender`) in under 3 seconds

**Prevention:**
- The preset system already has auto-expiry (log adjustments are temporary with a duration). This is a strong mitigation -- document it prominently.
- Consider rate-limiting the DEBUG log lines (e.g., sample 1 in N after a threshold). However, this adds complexity and may confuse users -- likely better to just document the volume implications.
- Add documentation to the preset UI: "Enabling this preset will produce approximately N log lines per query. On busy instances, this may generate significant log volume."
- Consider logging to a separate, bounded destination rather than STDOUT (but this conflicts with the "use existing log format" constraint).

**Detection:** Monitor disk usage and log aggregator ingest rates after enabling the preset in a staging environment.

**Phase:** Documentation during preset implementation. Consider volume guardrails if telemetry shows presets being left on for extended periods.

---

### Pitfall 6: Pivot Queries and Multi-Statement Requests Produce Confusing Log Output

**What goes wrong:** Metabase's pivot table queries decompose a single user request into multiple sub-queries (see `metabase.query-processor.pivot`). A single dashboard card can produce 5-20+ SQL statements. The summary log line says "query_count=15" but the user expected one query. Without clear documentation of what constitutes a "query" vs a "statement," the log output confuses rather than helps.

Similarly, dashboard loads trigger multiple card queries. If these all share the same request ID but execute concurrently on different threads, the log output interleaves statements from different cards.

**Prevention:**
- Define clear terminology in the log output: "request" (HTTP request), "card" (a question/visualization), "statement" (a single SQL execution).
- Include card_id in per-statement log lines so they can be filtered.
- For pivot queries, consider a sub-request-id or sequence number to group the decomposed statements.
- The summary line should aggregate correctly: total execution time should be wall-clock time for the request, not sum of individual statement times (which may overlap due to parallelism).

**Detection:** Enable logging on a dashboard with pivot tables and verify the output is comprehensible.

**Phase:** Design decision during the log line format specification phase.

---

### Pitfall 7: Correlation ID Mismatch Between Dynamic Var and MDC

**What goes wrong:** Metabase already has `*request-id*` as a dynamic var, used in `metabase.collections.models.collection` and the request middleware. If the new logging system uses MDC for correlation but some existing code continues to use `*request-id*`, you end up with two parallel correlation systems that may diverge (especially across thread boundaries where one propagates but not the other).

**Prevention:**
- Decide on ONE correlation mechanism. Since `*request-id*` already exists and is propagated via `bound-fn` in streaming responses, the simplest approach is to continue using it and push its value into MDC at the logging call site.
- Or: set MDC from `*request-id*` in the Ring middleware (where the binding happens) and use MDC consistently for all logging. Keep `*request-id*` for non-logging uses.
- Do NOT create a new, separate ID. Reuse `*request-id*`.

**Detection:** Search the codebase for all references to `*request-id*` and ensure they are consistent with the new logging correlation strategy.

**Phase:** Architecture decision in phase 1. Must be decided before any log lines are written.

---

### Pitfall 8: Existing Log Consumers Break Due to Format Changes

**What goes wrong:** Metabase users parse log output with tools like `grep`, `jq`, Fluentd, Logstash, and custom regex patterns. Adding new structured fields to existing log lines or changing existing patterns breaks their parsing.

The current format (`%date %level %logger{2} :: %message %notEmpty{%X}`) means MDC values are appended to every log line. If you start setting MDC keys for request correlation, EVERY existing log line (not just query logs) will now include those MDC values. This changes the format of every log line in the system.

**Consequences:** Customer log pipelines break. Alert rules stop matching. Monitoring dashboards go blank.

**Prevention:**
- NEW log lines (the summary and detail lines) can have any format -- they are additive.
- Be cautious about adding MDC keys that will appear in ALL log lines via `%notEmpty{%X}`. If the request-id appears on every single log line, that is a format change for every line. This might actually be desirable (correlating any log line to a request) but it needs to be documented as a behavioral change in release notes.
- Alternative: use MDC only for the query logging namespaces, not globally. But this defeats the purpose of request-wide correlation.
- Best approach: accept that adding request_id to MDC will change all log lines, document it as a feature ("all log lines are now correlated to requests"), and flag it prominently in the changelog.

**Detection:** Compare log output before and after the change. Check that existing log parsing examples in docs still work.

**Phase:** Must be decided in phase 1 architecture. Changelog item for release.

---

## Minor Pitfalls

### Pitfall 9: App DB Queries (H2/Postgres) Mixed Into Analytics Query Logs

**What goes wrong:** Metabase makes internal queries to its own application database (H2 or Postgres) for every request -- loading card definitions, checking permissions, fetching dashboard structure, etc. If the "analytics query logging" preset accidentally captures these internal queries, the log output is noisy and confusing. Users want to see queries to THEIR database, not Metabase's internal bookkeeping.

**Prevention:**
- Use separate namespaces for analytics query logging vs app DB query logging, as already planned in PROJECT.md.
- Ensure the namespace boundaries are clean: the JDBC execute path for connected databases (`metabase.driver.sql-jdbc.execute`) is distinct from the app DB path (`metabase.app-db.query` / Toucan2).
- Test with both presets independently and verify no cross-contamination.

**Phase:** Namespace design in phase 1. Testing in the preset implementation phase.

---

### Pitfall 10: Log Line Formatting Is Expensive for Large SQL Strings

**What goes wrong:** Some generated SQL queries are very large (10KB+ for complex dashboards with many filters). String formatting and logging these at DEBUG level involves allocating large strings, potentially multiple times (once for formatting, once for the log framework, once for the appender). The existing `metabase-appender` already truncates messages to 4000 characters (`elide-string` in `logger/core.clj`), which means detailed SQL will be silently truncated in the UI log viewer but fully written to STDOUT.

**Prevention:**
- Use lazy log message evaluation (the `clojure.tools.logging` macros already do this -- verify that `metabase.util.log` preserves this behavior).
- For the in-memory ring buffer, the 4000-char truncation is fine for the UI.
- For STDOUT, consider whether full SQL is necessary or if a truncated version with a "see full SQL at DEBUG/TRACE" hint is better.
- Do not `.toString()` the SQL until you know the log level is enabled.

**Phase:** Implementation detail during the per-statement log line phase.

---

### Pitfall 11: Testing Logging Behavior Is Hard Without Infrastructure

**What goes wrong:** Developers write the logging code, manually verify it "looks right" in the REPL, and ship it. Later, a refactor changes the QP middleware ordering or a new async path is introduced, and the correlation IDs silently stop working. Nobody notices until a customer reports it.

**Prevention:**
- Metabase has `metabase.util.log.capture` (or similar test utilities) for capturing log output in tests. Use it.
- Write tests that:
  1. Execute a query through the full QP pipeline
  2. Capture log output
  3. Assert the summary line appears with expected fields
  4. Assert per-statement lines appear with matching correlation IDs
  5. Run this on the streaming response path (async), not just synchronous
- Add a test that runs two concurrent requests and verifies their log lines are correctly correlated (no cross-contamination).

**Phase:** Test infrastructure should be set up in phase 1. Each subsequent phase should add tests for its specific log lines.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Correlation ID infrastructure | MDC leaking between requests on pooled threads (Pitfall 3) | Clear MDC in `finally`, test with sequential reuse |
| Correlation ID infrastructure | Dynamic var vs MDC divergence (Pitfall 7) | Decide on single mechanism, document decision |
| Summary log line (INFO) | Performance overhead on every request (Pitfall 4) | Benchmark under load, keep computation minimal |
| Summary log line (INFO) | Format change for all existing log lines if using MDC (Pitfall 8) | Document as feature, flag in changelog |
| Per-statement log lines (DEBUG) | Parameter values containing PII (Pitfall 2) | Gate behind DEBUG, document security implications |
| Per-statement log lines (DEBUG) | Pivot query confusion (Pitfall 6) | Include card_id, define terminology |
| Logging presets | Volume explosion (Pitfall 5) | Auto-expiry (already exists), document volume expectations |
| Logging presets | App DB cross-contamination (Pitfall 9) | Separate namespaces, test independently |

## Sources

- Direct codebase analysis of Metabase source (all findings verified against current code):
  - `src/metabase/config/core.clj` -- `*request-id*` dynamic var definition
  - `src/metabase/server/middleware/request_id.clj` -- request ID binding
  - `src/metabase/server/streaming_response.clj` -- `bound-fn` usage, thread pool submission
  - `src/metabase/query_processor/middleware/process_userland_query.clj` -- intentional non-propagation of bindings in async save
  - `src/metabase/logger/core.clj` -- synchronized ring buffer, appender architecture
  - `src/metabase/logger/api.clj` -- preset system with auto-expiry
  - `resources/log4j2.xml` -- `%notEmpty{%X}` MDC pattern, existing redaction
  - `src/metabase/server/streaming_response/thread_pool.clj` -- fixed thread pool, thread reuse
- JVM MDC behavior: standard Log4j2 ThreadContext documentation (HIGH confidence, well-established JVM pattern)
- Clojure dynamic var threading semantics: core language behavior (HIGH confidence)

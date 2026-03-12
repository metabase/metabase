# Feature Landscape: Structured Query Logging

**Domain:** Application-level database query logging for a BI tool (Metabase)
**Researched:** 2026-03-12

## Table Stakes

Features users expect from any query logging system. Missing these makes the feature feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full SQL text in log output | The entire point -- users need to see what queries Metabase sends. Django, Rails, Hibernate, ProxySQL all log full SQL. Without this, the feature has no value. | Low | Already partially available at verbose debug levels; needs dedicated clean output |
| Execution time per query | Every query logger from PostgreSQL's `log_min_duration_statement` to P6Spy to ProxySQL logs duration. Essential for identifying slow queries. | Low | Available in QP pipeline; just needs surfacing |
| Request-level correlation ID | Allows grouping all queries from a single user action (card view, dashboard load). ProxySQL uses thread_id, Rails uses request tags. Metabase already has `*request-id*` in middleware. | Low | `metabase.server.middleware.request-id` already generates UUIDs per request; just needs threading through to log lines |
| Runtime toggle without restart | The preset system already supports this pattern (sync, linked filters, serialization presets). Users need to flip query logging on/off without downtime. | Low | Existing `metabase.logger.api` preset system handles this; just need new preset definitions |
| Summary log line (INFO level) | One line per request showing query count, total time, database target. Cheap enough to leave always-on. Analogous to Rails' "Completed 200 OK in 234ms (Views: 5.0ms | ActiveRecord: 229ms | 12 queries)" | Medium | Needs aggregation across middleware pipeline; must be low-overhead |
| Detailed per-statement log lines (DEBUG level) | Individual SQL statements with parameters, timing, database ID. This is the "turn on for debugging" level. Analogous to Django's `django.db.backends` DEBUG, P6Spy's statement logging. | Medium | Needs careful placement in JDBC execution layer |
| Separate analytics vs app DB presets | Users troubleshooting slow dashboards don't want internal app DB noise, and vice versa. The issue comments explicitly request this separation. Sync/scan vs user query separation was the #1 comment request. | Low | Two preset definitions pointing at different namespace sets |
| Parameter values in log output | Parameterized queries without parameter values are hard to reproduce/debug. P6Spy, ProxySQL (with `eventslog_stmt_parameters`), Django all support this. | Low | Parameters already available in execution layer; just needs formatting |
| Database identification | Which connected database the query targets. Essential when Metabase connects to multiple databases. ProxySQL logs hostgroup_id for similar reasons. | Low | Database ID available in QP context |
| User identification | Which Metabase user triggered the query. Essential for audit and debugging. | Low | User ID available in request context |

## Differentiators

Features that would make Metabase's query logging notably better than generic solutions. Not expected, but high value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Card/Dashboard attribution | Log which saved question or dashboard triggered the query. Unique to Metabase -- generic loggers can't do this. Lets admins trace "dashboard X is slow" directly to the SQL. | Low | Card ID / Dashboard ID available in QP pipeline context |
| Query type classification | Distinguish user queries, sync queries, scan queries, pulse/subscription queries in log output. The #1 feature request in issue comments. No generic logger can provide this. | Medium | Requires identifying query origin in the middleware pipeline |
| Row count in summary | How many rows were returned. Helps identify queries returning unexpectedly large result sets. PostgreSQL logs this with `log_statement`, ProxySQL logs `rows_sent`. | Low | Available from result metadata |
| Preset combinations | A combined "all query logging" preset that enables both analytics and app DB logging at once. Issue comments note the awkwardness of needing to enable two presets. | Low | Third preset that unions both namespace sets |
| Query count per request | "This dashboard load generated 47 queries" in the summary line. Immediately surfaces N+1 patterns. Rails added this in recent versions. | Low | Counter in middleware; aggregate at summary |

## Anti-Features

Features to explicitly NOT build in this implementation. Important to scope correctly.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Data masking/redaction | Adds significant complexity, unclear user demand for a self-hosted tool where admins already have DB access. PROJECT.md explicitly marks out of scope. | Layer on later if needed. Users who need this likely have network-level solutions. |
| JSON/structured log format | Metabase uses a standard text log format. Introducing JSON logging would be inconsistent and confusing. PROJECT.md constrains to existing format. | Use Metabase's standard log format. Users who need structured logs can configure log4j2 JSON layout externally. |
| Query plan / EXPLAIN logging | PostgreSQL has `auto_explain`, but running EXPLAIN from the application layer is expensive, driver-specific, and risks side effects. Far too complex for initial scope. | Document that users can enable `auto_explain` on their database side. |
| Non-JDBC driver support | BigQuery, MongoDB, Druid use different execution paths. Supporting them multiplies scope without covering the majority use case. PROJECT.md marks out of scope. | SQL/JDBC covers most users. Extend to other drivers in a follow-up. |
| Query result caching interaction logging | Whether a query hit the cache or went to the DB. Useful but a separate concern that complicates the logging middleware. | Separate feature; cache hits already have their own logging. |
| Persistent query log storage | ProxySQL stores logs in SQLite tables. Metabase should NOT build a query log database -- it's a BI tool, not a proxy. | Rely on standard log infrastructure (files, syslog, log aggregators). Users who need persistent query analytics should use their existing log management. |
| Slow query threshold alerting | MySQL/PostgreSQL have slow query logs with configurable thresholds. Building this into Metabase duplicates database-side functionality. | Users can grep logs for queries exceeding thresholds, or configure database-side slow query logs. |
| SQLCommenter-style query annotation | Injecting trace context as SQL comments into queries sent to the database. Powerful for database-side correlation but modifies the actual SQL, which could break query caching and has security implications. | Consider as a separate future feature. The current scope is application-side logging only. |
| General API request/response logging | Not related to query visibility. Different concern entirely. | Existing request logging middleware handles this. |

## Feature Dependencies

```
Request correlation ID ──> Summary log line (needs ID to correlate)
Request correlation ID ──> Detailed per-statement log lines (needs ID to correlate)
Summary log line ──> Query count per request (count feeds into summary)
Detailed per-statement log lines ──> Parameter values (params are part of detail)
Preset definitions ──> Runtime toggle (presets enable the toggle UX)
Analytics preset + App DB preset ──> Preset combinations (combined preset needs both)
Query type classification ──> Separate analytics vs app DB presets (classification informs preset grouping)
```

Core dependency chain:
```
1. Correlation ID plumbing (foundation)
2. Detailed per-statement logging (core value)
3. Summary log line with aggregation (depends on per-statement data)
4. Preset definitions (activates everything via existing UI)
```

## MVP Recommendation

**Prioritize (in order):**

1. **Correlation ID threading** -- Foundation for everything else. Metabase already has `*request-id*`; just needs to be propagated to log output via MDC or similar.
2. **Detailed per-statement log lines** (DEBUG) -- Full SQL, parameters, execution time, database ID, request ID. This is the core "see what queries Metabase sends" feature.
3. **Summary log line** (INFO) -- One line per request: request ID, query count, total time, database ID, card/dashboard ID, user ID. Cheap enough to leave on.
4. **Two presets** (analytics queries + app DB queries) -- Activates the feature through the existing admin UI.
5. **Card/Dashboard attribution** -- Low-hanging differentiator unique to Metabase.

**Defer:**

- **Query type classification** (sync vs user vs pulse): Valuable but requires deeper investigation of how to reliably distinguish query origins across the middleware pipeline. Good candidate for a fast follow.
- **Preset combinations**: Nice-to-have polish. The two individual presets cover the core use case.
- **Row count in summary**: Easy to add later once the summary line format is established.

## Sources

- [ProxySQL Query Logging Documentation](https://www.proxysql.com/documentation/query-logging/)
- [ProxySQL Advanced Event and Query Logging](https://proxysql.com/documentation/advanced-event-and-query-logging/)
- [PgBouncer Configuration](https://www.pgbouncer.org/config.html)
- [PostgreSQL Error Reporting and Logging](https://www.postgresql.org/docs/current/runtime-config-logging.html)
- [PostgreSQL auto_explain](https://www.postgresql.org/docs/current/auto-explain.html)
- [Rails ActiveRecord::QueryLogs](https://api.rubyonrails.org/classes/ActiveRecord/QueryLogs.html)
- [Django Logging Documentation](https://docs.djangoproject.com/en/4.2/ref/logging/)
- [SQLCommenter / OpenTelemetry](https://open-telemetry.github.io/opentelemetry-sqlcommenter/)
- [P6Spy JDBC logging](https://vladmihalcea.com/the-best-way-to-log-jdbc-statements/)
- [Metabase Issue #49198](https://github.com/metabase/metabase/issues/49198)
- Metabase source: `metabase.logger.api` (existing preset system), `metabase.server.middleware.request-id` (existing request ID)

# Structured Query Logging

## What This Is

A two-tier structured query logging system for Metabase that gives users easy visibility into all SQL queries sent to connected databases. It adds a per-request summary log line (INFO level) and per-statement detailed log lines (DEBUG level), correlated by a shared request ID, with logging presets to toggle detail levels without restart.

## Core Value

Users can see exactly what SQL queries Metabase sends to their databases, filtered by request, without wading through unrelated log noise.

## Requirements

### Validated

- ✓ Existing logging infrastructure (log4j2 via `metabase.logger`) — existing
- ✓ Logging preset system in `metabase.logger.api` — existing
- ✓ Query processor middleware pipeline — existing
- ✓ JDBC execution layer in `metabase.driver.sql_jdbc.execute` — existing
- ✓ App DB query execution in `metabase.app_db.query` — existing

### Active

- [ ] Summary log line per request (INFO level) with request ID, card/dashboard ID, database ID, query count, total execution time, user ID, query type
- [ ] Detailed per-statement log lines (DEBUG level) with request ID, full SQL, parameters, individual execution time, database ID
- [ ] "Analytics query logging" preset for user-facing database queries
- [ ] "Application database logging" preset for internal app DB queries
- [ ] Correlation ID shared across all log lines for a single request
- [ ] Standard Metabase log format for all new log lines

### Out of Scope

- Non-SQL API request/response logging — not related to query visibility
- Modifying general-purpose logging infrastructure — leverage existing system
- Data masking/redaction — can be layered on later
- Non-JDBC drivers (BigQuery, Mongo, etc.) — SQL/JDBC covers most users, extend later

## Context

- GitHub issue: #49198
- Current state: getting query visibility requires enabling very verbose low-level logging, which produces too much noise to be practical
- The query processor is a middleware pipeline that compiles MBQL to SQL and executes via JDBC drivers
- Metabase already has a logging preset system that allows runtime toggling of log levels for specific namespaces
- The app DB layer (`metabase.app_db.query`) handles internal queries to Metabase's own database (H2/Postgres)
- Need to investigate existing request/execution IDs in the QP pipeline to determine the best correlation ID strategy

## Constraints

- **Log format**: Use Metabase's existing standard log format — no custom JSON or key-value format
- **Driver scope**: SQL/JDBC drivers only for initial implementation
- **Performance**: Summary log line must be cheap enough to leave always-on at INFO level
- **Runtime toggle**: Detailed logging must be controllable via the preset system without restart
- **Concurrency safety**: Correlation IDs must work correctly under concurrent request processing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Standard log format over JSON/KV | Consistency with existing Metabase logs | — Pending |
| SQL/JDBC drivers only | Covers majority of users, simpler initial scope | — Pending |
| Reuse existing ID vs create new | Need to investigate what's available in QP pipeline | — Pending |

---
*Last updated: 2026-03-12 after initialization*

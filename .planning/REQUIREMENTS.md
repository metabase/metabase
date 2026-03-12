# Requirements: Structured Query Logging

**Defined:** 2026-03-12
**Core Value:** Users can see exactly what SQL queries Metabase sends to their databases, filtered by request, without noise.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Correlation

- [x] **CORR-01**: All log lines for a single request share a consistent correlation ID (request_id) that can be grepped to filter to exactly one request's logs
- [x] **CORR-02**: Correlation ID works correctly under concurrent request processing (no cross-request leakage)

### Summary Logging

- [x] **SUMM-01**: At the end of each query execution, a single INFO-level log line is emitted containing: request ID, card ID (if applicable), dashboard ID (if applicable), database ID, number of SQL queries issued, total DB execution time, user ID, and query type
- [x] **SUMM-02**: Summary log line is cheap enough to leave always-on at INFO level
- [x] **SUMM-03**: Summary log line uses Metabase's existing standard log format

### Detail Logging

- [x] **DETL-01**: For each SQL statement executed during a request, a DEBUG-level log line is emitted containing: request ID, full compiled SQL, parameter count and values, individual query execution time, and database ID
- [x] **DETL-02**: Detail log lines are only emitted when the analytics query logging preset is enabled
- [x] **DETL-03**: Detail log lines use Metabase's existing standard log format

### Query Attribution

- [x] **ATTR-01**: Log lines include the card ID (saved question) that triggered the query, when applicable
- [x] **ATTR-02**: Log lines include the dashboard ID that triggered the query, when applicable
- [x] **ATTR-03**: Log lines classify the query type (user query vs sync/scan)

### Logging Presets

- [x] **PRES-01**: An "Analytics query logging" preset is added to the existing preset system that enables detailed DEBUG logging for user-facing database queries
- [x] **PRES-02**: Users can enable/disable the analytics query logging preset without restart via the existing logging API

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### App DB Logging

- **APDB-01**: An "Application database logging" preset enables detailed logging for internal Metabase app DB queries
- **APDB-02**: App DB detail log lines include full SQL, parameters, execution time

### Enhanced Attribution

- **EATR-01**: Row count included in summary log line
- **EATR-02**: Combined "all query logging" preset enables both analytics and app DB logging
- **EATR-03**: Non-HTTP entry points (scheduled pulses, subscriptions) generate synthetic correlation IDs

### Extended Drivers

- **EDRV-01**: Query logging works for non-JDBC drivers (BigQuery, MongoDB, etc.)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Data masking/redaction | Can be layered on later; unclear user demand for self-hosted tool |
| JSON/structured log format | Inconsistent with existing Metabase log format |
| Query plan / EXPLAIN logging | Expensive, driver-specific; users can enable database-side |
| Persistent query log storage | Metabase is a BI tool, not a proxy; rely on log infrastructure |
| SQLCommenter query annotation | Modifies actual SQL; separate concern |
| General API request/response logging | Different concern from query visibility |
| Application database query logging | Deferred to v2 to reduce initial scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORR-01 | Phase 1 | Complete |
| CORR-02 | Phase 1 | Complete |
| SUMM-01 | Phase 1 | Complete |
| SUMM-02 | Phase 1 | Complete |
| SUMM-03 | Phase 1 | Complete |
| DETL-01 | Phase 2 | Complete |
| DETL-02 | Phase 2 | Complete |
| DETL-03 | Phase 2 | Complete |
| ATTR-01 | Phase 1 | Complete |
| ATTR-02 | Phase 1 | Complete |
| ATTR-03 | Phase 1 | Complete |
| PRES-01 | Phase 3 | Complete |
| PRES-02 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation*

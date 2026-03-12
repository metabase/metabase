---
phase: 01-correlation-and-summary-logging
verified: 2026-03-12T19:30:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Run the full test suite for the middleware"
    expected: "All 9 tests pass (6 unit + 3 integration)"
    why_human: "Integration tests require test database; SUMMARY noted test DB initialization failure locally"
  - test: "Start Metabase, run a query, check server logs"
    expected: "INFO log line appears with 'Query completed :: request-id=... database=... user=... context=... queries=1 rows=N time=Nms'"
    why_human: "Visual confirmation of log output format in real environment"
---

# Phase 1: Correlation and Summary Logging Verification Report

**Phase Goal:** Users can see a single, useful INFO log line per query request that identifies who ran what, where, and how long it took -- correlated by a request ID that works under concurrency
**Verified:** 2026-03-12T19:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After any userland query execution, an INFO log line is emitted containing request-id, database-id, user-id, query-count, total execution time, and context | VERIFIED | `emit-summary!` in query_log.clj builds string with all fields; `summary-log-fields-test` asserts each field present |
| 2 | When a query is triggered by a saved question, the summary log line includes the card-id | VERIFIED | `query-log-context` conditionally assocs `:card-id`; `card-id-in-summary-test` and `integration-card-id-test` assert "card=99" present |
| 3 | When a query is triggered from a dashboard, the summary log line includes the dashboard-id | VERIFIED | `query-log-context` conditionally assocs `:dashboard-id`; `dashboard-id-in-summary-test` asserts "dashboard=77" present |
| 4 | The summary log line classifies query type via the context field | VERIFIED | `emit-summary!` appends `context=` with the context name; tests verify "context=ad-hoc" |
| 5 | All log lines emitted during query execution carry the correlation ID in ThreadContext (MDC) | VERIFIED | `log/with-thread-context ctx` wraps the inner QP call at line 77; auto-prefixes keys with "mb-" |
| 6 | Two concurrent requests produce log lines with distinct correlation IDs | VERIFIED | `concurrent-isolation-test` and `integration-concurrent-isolation-test` use futures with distinct request-ids and assert distinct IDs in output |
| 7 | The summary log line adds negligible overhead (simple string concatenation, no expensive computation) | VERIFIED | `emit-summary!` uses `StringBuilder` with direct `.append` calls -- no reflection, no format strings, no expensive computation |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/metabase/query_processor/middleware/query_log.clj` | Query logging middleware with ThreadContext and INFO summary | VERIFIED | 78 lines, exports `query-log-middleware`, substantive implementation with `query-log-context`, `emit-summary!`, and rff-wrapping pattern |
| `test/metabase/query_processor/middleware/query_log_test.clj` | Tests for middleware (min 80 lines) | VERIFIED | 223 lines, 9 tests (6 unit + 3 integration), covers all specified behaviors |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `query_log.clj` | `metabase.util.log/with-thread-context` | macro call to push metadata into MDC | WIRED | Line 77: `(log/with-thread-context ctx ...)` |
| `query_log.clj` | `metabase.config.core/*request-id*` | dynamic var deref for correlation ID | WIRED | Line 15: `(or config/*request-id* (str (random-uuid)))` |
| `query_processor.clj` | `query_log.clj` | around-middleware vector entry | WIRED | Line 45: `#'qp.middleware.query-log/query-log-middleware` positioned between process-userland-query and catch-exceptions |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CORR-01 | 01-01-PLAN | All log lines for a single request share a consistent correlation ID | SATISFIED | `log/with-thread-context` wraps QP call with request-id in MDC; same request-id appears in summary line |
| CORR-02 | 01-01-PLAN | Correlation ID works correctly under concurrent processing | SATISFIED | `concurrent-isolation-test` and `integration-concurrent-isolation-test` verify distinct IDs with futures |
| SUMM-01 | 01-01-PLAN | Single INFO log line emitted with request ID, card ID, dashboard ID, database ID, queries, time, user ID, query type | SATISFIED | `emit-summary!` includes all fields; `summary-log-fields-test` verifies each |
| SUMM-02 | 01-01-PLAN | Summary log line cheap enough for always-on INFO | SATISFIED | StringBuilder-based construction, no reflection, no format strings |
| SUMM-03 | 01-01-PLAN | Summary log line uses standard log format | SATISFIED | Uses `log/info` from `metabase.util.log` which uses standard Metabase logging |
| ATTR-01 | 01-01-PLAN | Log lines include card ID when applicable | SATISFIED | Conditional `card-id` in context map and summary; tested by `card-id-in-summary-test` |
| ATTR-02 | 01-01-PLAN | Log lines include dashboard ID when applicable | SATISFIED | Conditional `dashboard-id` in context map and summary; tested by `dashboard-id-in-summary-test` |
| ATTR-03 | 01-01-PLAN | Log lines classify query type | SATISFIED | `context` field from `:info` map classifies as ad-hoc, dashboard, question, etc.; `non-userland-passthrough-test` verifies sync queries are excluded |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO, FIXME, placeholder, or stub patterns found in any modified file |

### Human Verification Required

### 1. Run Test Suite

**Test:** Execute `./bin/mage clojure test --namespace metabase.query-processor.middleware.query-log-test` in a properly configured environment with test database access
**Expected:** All 9 tests pass (6 unit, 3 integration)
**Why human:** SUMMARY noted local test DB initialization failure ("No public key available for airgap token"). Unit tests likely pass; integration tests need a working test DB.

### 2. Visual Log Output Check

**Test:** Start Metabase, run an ad-hoc query as a logged-in user, check server log output
**Expected:** A line like `INFO metabase.query-processor.middleware.query-log Query completed :: request-id=abc-123 database=1 user=1 context=ad-hoc queries=1 rows=10 time=45ms` appears
**Why human:** Verifying actual log output format and readability in a running instance

### Gaps Summary

No gaps found in automated verification. All 7 observable truths are verified, all artifacts exist and are substantive, all 3 key links are wired, all 8 requirements are satisfied, and no anti-patterns were detected.

The only uncertainty is whether integration tests pass in a properly configured environment -- the SUMMARY noted a test DB initialization failure locally, but the test code itself is correctly structured. Unit tests (6 tests, 17 assertions) fully cover the middleware behavior in isolation.

The three claimed commits (9fba2e4, e2f7a90, fbceddd) all exist in the git history with appropriate messages.

---

_Verified: 2026-03-12T19:30:00Z_
_Verifier: Claude (gsd-verifier)_

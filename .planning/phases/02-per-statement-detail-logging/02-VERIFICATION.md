---
phase: 02-per-statement-detail-logging
verified: 2026-03-12T20:00:00Z
status: passed
score: 3/3 must-haves verified
---

# Phase 2: Per-Statement Detail Logging Verification Report

**Phase Goal:** Users can see the exact SQL and parameters Metabase sends to their database for every statement in a request, correlated to the summary line
**Verified:** 2026-03-12T20:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When detail logging is enabled, each SQL statement executed during a request produces a DEBUG log line containing full compiled SQL, parameter values, individual execution time, and database ID | VERIFIED | `emit-statement-detail!` at execute.clj:611-633 builds log line with StringBuilder containing database=N, SQL text, params, time=Nms. Called at line 816 inside `execute-reducible-query` after `execute-statement-or-prepared-statement!` returns. |
| 2 | Detail log lines share the same correlation ID as the request's summary line, so grepping the request ID shows both summary and detail together | VERIFIED | `emit-statement-detail!` uses `log/debug` which emits through Log4j2. Phase 1 established ThreadContext with request-id in the query-log middleware, which wraps query execution. By the time execute-reducible-query runs, ThreadContext already contains mb-request-id, which Log4j2 includes automatically via the `%notEmpty{%X}` pattern. |
| 3 | Detail log lines use the standard Metabase log format | VERIFIED | Uses `log/debug` from `metabase.util.log` (imported at execute.clj:27), which is the standard Metabase logging macro. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/metabase/driver/sql_jdbc/execute.clj` | `emit-statement-detail!` function with `log/debug` | VERIFIED | Function at lines 611-633, uses StringBuilder, log/debug macro, wired into execute-reducible-query at line 816 |
| `test/metabase/driver/sql_jdbc/execute/query_log_test.clj` | Tests for per-statement DEBUG logging, min 60 lines | VERIFIED | 72 lines, 5 tests: content, level gating, format, empty params, full format match |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `execute.clj` | `metabase.util.log/debug` | `log/debug` call wrapping statement execution | WIRED | `log/debug` called at line 617 inside `emit-statement-detail!`; `metabase.util.log` imported as `log` at line 27 |
| `execute.clj` | `metabase.util/start-timer` | timing wrapper around `execute-statement-or-prepared-statement!` | WIRED | `u/start-timer` at line 814, `u/since-ms` at line 816 passed to `emit-statement-detail!` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DETL-01 | 02-01-PLAN | Per-statement DEBUG log with request ID, full SQL, params, execution time, database ID | SATISFIED | `emit-statement-detail!` emits all fields; request-id comes from ThreadContext automatically |
| DETL-02 | 02-01-PLAN | Detail log lines only emitted when analytics query logging preset is enabled | SATISFIED | Uses `log/debug` macro which is a no-op at INFO level; StringBuilder construction is inside the macro arg (lazy evaluation). Phase 3 preset will control enabling DEBUG level. |
| DETL-03 | 02-01-PLAN | Detail log lines use standard Metabase log format | SATISFIED | Uses `metabase.util.log/debug` -- same logging infrastructure as all other Metabase code |

No orphaned requirements found. All three requirement IDs (DETL-01, DETL-02, DETL-03) from the PLAN are accounted for and map to Phase 2 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No TODOs, FIXMEs, placeholders, empty implementations, or stub patterns found in modified/created files.

### Human Verification Required

### 1. DEBUG log line appears in actual query execution

**Test:** Enable DEBUG logging for `metabase.driver.sql-jdbc.execute`, run a question, check server logs.
**Expected:** A log line like `Statement executed :: database=N SQL: SELECT ... time=Nms` appears with the same request-id as the INFO summary line from Phase 1.
**Why human:** Requires running Metabase with a real database and verifying log output end-to-end.

### 2. No performance impact at INFO level

**Test:** Run queries with default INFO logging and compare response times to baseline.
**Expected:** No measurable difference -- the StringBuilder is never constructed at INFO level.
**Why human:** Performance verification requires timing measurements under realistic load.

### Gaps Summary

No gaps found. All three success criteria are verified, both artifacts are substantive and wired, all three requirements are satisfied, and no anti-patterns were detected. The commit (5180b97a535) exists in git history.

---

_Verified: 2026-03-12T20:00:00Z_
_Verifier: Claude (gsd-verifier)_

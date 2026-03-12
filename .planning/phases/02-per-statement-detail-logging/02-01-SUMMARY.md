---
phase: 02-per-statement-detail-logging
plan: 01
subsystem: query-execution
tags: [log4j2, debug-logging, jdbc, sql-statement, per-statement, stringbuilder]

# Dependency graph
requires:
  - phase: 01-correlation-and-summary-logging
    provides: "ThreadContext correlation with request-id for log filtering"
provides:
  - "Per-statement DEBUG logging in JDBC execute layer with SQL, params, timing, database ID"
  - "emit-statement-detail! function for per-statement log emission"
affects: [03-logging-presets]

# Tech tracking
tech-stack:
  added: []
  patterns: [stringbuilder-debug-logging, macro-guarded-log-construction]

key-files:
  created:
    - test/metabase/driver/sql_jdbc/execute/query_log_test.clj
  modified:
    - src/metabase/driver/sql_jdbc/execute.clj

key-decisions:
  - "Used log/debug macro guard to avoid StringBuilder construction when DEBUG is disabled (macro evaluates arg lazily)"
  - "Made emit-statement-detail! public for direct unit testing rather than testing through JDBC integration"
  - "Omit params field entirely when nil/empty rather than showing params=[]"

patterns-established:
  - "Debug log construction: StringBuilder inside log/debug macro arg (lazy evaluation avoids overhead at INFO level)"
  - "Per-statement timing: u/start-timer before execute, u/since-ms after, emit detail"

requirements-completed: [DETL-01, DETL-02, DETL-03]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 2 Plan 01: Per-Statement Detail Logging Summary

**Per-statement DEBUG log lines in JDBC execute layer with full SQL text, parameter values, execution time, and database ID using StringBuilder construction guarded by log/debug macro**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T19:23:25Z
- **Completed:** 2026-03-12T19:26:45Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `emit-statement-detail!` function to `execute.clj` using StringBuilder for log line construction
- Wired timing into `execute-reducible-query` with `u/start-timer` and `u/since-ms` around statement execution
- Log line format: `Statement executed :: database=N SQL: ... params=[...] time=Nms` (params omitted when empty)
- ThreadContext correlation (request-id from Phase 1) automatically appears in log output via Log4j2 pattern
- 5 unit tests with 12 assertions covering content, format, level gating, and empty params handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Add per-statement DEBUG logging to JDBC execute and write tests** - `5180b97a535` (feat, TDD)

## Files Created/Modified
- `src/metabase/driver/sql_jdbc/execute.clj` - Added `emit-statement-detail!` function and timing wrapper in `execute-reducible-query`
- `test/metabase/driver/sql_jdbc/execute/query_log_test.clj` - 5 unit tests for per-statement DEBUG logging

## Decisions Made
- Used `log/debug` macro's lazy evaluation of its argument to guard StringBuilder construction (no overhead at INFO level, no separate `is-debug?` check needed)
- Made `emit-statement-detail!` public for direct testability rather than testing through full JDBC integration
- Params omitted from log line when nil/empty for cleaner output
- Removed `^:parallel` from tests to satisfy kondo linter (function ends with `!`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed ^:parallel from tests to satisfy kondo linter**
- **Found during:** Task 1 (linting)
- **Issue:** kondo flagged `emit-statement-detail!` as destructive function not allowed in parallel tests
- **Fix:** Removed `^:parallel` annotations from all test definitions
- **Files modified:** test/metabase/driver/sql_jdbc/execute/query_log_test.clj
- **Verification:** `./bin/mage kondo` passes with 0 warnings
- **Committed in:** 5180b97a535 (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed expected-value-first assertion order**
- **Found during:** Task 1 (linting)
- **Issue:** kondo warned "Write expected value first" for `(is (= msg expected))`
- **Fix:** Swapped to `(is (= expected msg))` format
- **Files modified:** test/metabase/driver/sql_jdbc/execute/query_log_test.clj
- **Verification:** `./bin/mage kondo` passes with 0 warnings
- **Committed in:** 5180b97a535 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking linter issues)
**Impact on plan:** Both auto-fixes required by project linting rules. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Per-statement DEBUG logging is complete and ready for Phase 3 logging presets
- Phase 3 will provide the admin UI preset that enables DEBUG level for `metabase.driver.sql-jdbc.execute`
- Combined with Phase 1 ThreadContext, users can filter by request-id to see both summary and individual SQL statements

---
*Phase: 02-per-statement-detail-logging*
*Completed: 2026-03-12*

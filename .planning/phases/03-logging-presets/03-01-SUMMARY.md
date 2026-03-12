---
phase: 03-logging-presets
plan: 01
subsystem: api
tags: [clojure, logging, presets, sql-jdbc]

# Dependency graph
requires:
  - phase: 02-per-statement-detail-logging
    provides: "metabase.driver.sql-jdbc.execute namespace with emit-statement-detail! DEBUG logging"
provides:
  - "analytics-query-logging preset in GET /api/logger/presets"
  - "One-click DEBUG activation for sql-jdbc.execute namespace via existing logging API"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["Logger preset definition pattern with loggers-under and doto guard"]

key-files:
  created: []
  modified:
    - src/metabase/logger/api.clj
    - test/metabase/logger/api_test.clj

key-decisions:
  - "Targeted only metabase.driver.sql-jdbc.execute (not query-log middleware) to keep preset focused on per-statement detail"

patterns-established:
  - "Analytics query logging preset follows identical pattern to sync/linkedfilters/serialization presets"

requirements-completed: [PRES-01, PRES-02]

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 3 Plan 1: Logging Presets Summary

**Analytics query logging preset targeting sql-jdbc.execute at DEBUG level, integrated with existing admin logging API**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T19:34:54Z
- **Completed:** 2026-03-12T19:36:31Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added "Analytics query logging" preset as 4th entry in the presets vector
- Preset targets metabase.driver.sql-jdbc.execute namespace at DEBUG level
- Works through existing POST /api/logger/adjustment endpoint without restart
- Test updated to verify 4th preset in GET /api/logger/presets response

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: Failing test for analytics-query-logging preset** - `b30512fa89d` (test)
2. **Task 1 GREEN: Add analytics-query-logging preset** - `53d44f6838a` (feat)

## Files Created/Modified
- `src/metabase/logger/api.clj` - Added analytics-query-logging preset entry to presets function
- `test/metabase/logger/api_test.clj` - Added 4th preset expectation in presets-test

## Decisions Made
- Targeted only metabase.driver.sql-jdbc.execute (not metabase.query-processor.middleware.query-log) to keep the preset focused on per-statement detail logging from Phase 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 phases complete: correlation/summary logging, per-statement detail, and presets
- The analytics query logging preset provides admin UI integration for the Phase 2 detail logging

---
*Phase: 03-logging-presets*
*Completed: 2026-03-12*

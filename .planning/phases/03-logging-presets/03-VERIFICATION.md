---
phase: 03-logging-presets
verified: 2026-03-12T20:00:00Z
status: passed
score: 3/3 must-haves verified
gaps: []
must_haves:
  truths:
    - "An 'Analytics query logging' preset appears in GET /api/logger/presets response"
    - "When preset is applied via POST /api/logger/adjustment, DEBUG level is set for metabase.driver.sql-jdbc.execute"
    - "The preset can be enabled and disabled without restart via the existing logging API"
  artifacts:
    - path: "src/metabase/logger/api.clj"
      provides: "Analytics query logging preset entry in presets function"
      contains: ":analytics-query-logging"
    - path: "test/metabase/logger/api_test.clj"
      provides: "Test verifying the new preset appears in GET /api/logger/presets"
      contains: "analytics-query-logging"
  key_links:
    - from: "src/metabase/logger/api.clj presets function"
      to: "metabase.driver.sql-jdbc.execute namespace"
      via: "loggers-under call targeting the JDBC execute namespace"
      pattern: "loggers-under.*sql.jdbc.execute"
---

# Phase 3: Logging Presets Verification Report

**Phase Goal:** Admins can enable and disable detailed query logging at runtime through the existing Metabase admin UI, without restart
**Verified:** 2026-03-12T20:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An "Analytics query logging" preset appears in GET /api/logger/presets response | VERIFIED | `src/metabase/logger/api.clj` line 82: `{:id :analytics-query-logging` is the 4th entry in the `presets` vector. Test at `test/metabase/logger/api_test.clj` line 42-44 asserts it appears in API response. |
| 2 | When preset is applied via POST /api/logger/adjustment, DEBUG level is set for metabase.driver.sql-jdbc.execute | VERIFIED | `src/metabase/logger/api.clj` line 84: `(loggers-under "metabase.driver.sql-jdbc.execute")` followed by `(map #(assoc % :level :debug))` sets DEBUG on all loggers under that namespace. The existing `/adjustment` endpoint (line 204) accepts namespace-level pairs and calls `set-log-levels!`. |
| 3 | The preset can be enabled and disabled without restart via the existing logging API | VERIFIED | The preset is served by `GET /api/logger/presets` (line 91-99) and its loggers are applied through the existing `POST /api/logger/adjustment` endpoint (line 204-241) which calls `set-log-levels!` at runtime. `DELETE /api/logger/adjustment` (line 247-255) undoes changes. No restart needed -- all runtime log level mutation. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/metabase/logger/api.clj` | Analytics query logging preset entry in presets function | VERIFIED | Contains `:analytics-query-logging` at line 82, follows identical pattern to existing presets (sync, linkedfilters, serialization) |
| `test/metabase/logger/api_test.clj` | Test verifying the new preset appears in GET /api/logger/presets | VERIFIED | Contains `analytics-query-logging` assertion at line 42-44 within `presets-test`, validates id, display_name, and logger structure |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/metabase/logger/api.clj` presets function | `metabase.driver.sql-jdbc.execute` namespace | `loggers-under` call | WIRED | Line 84: `(loggers-under "metabase.driver.sql-jdbc.execute")` directly targets the namespace containing Phase 2's `emit-statement-detail!` function |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PRES-01 | 03-01-PLAN.md | An "Analytics query logging" preset is added to the existing preset system that enables detailed DEBUG logging for user-facing database queries | SATISFIED | Preset entry exists in `presets` function with `:id :analytics-query-logging`, targets `metabase.driver.sql-jdbc.execute` at `:debug` level |
| PRES-02 | 03-01-PLAN.md | Users can enable/disable the analytics query logging preset without restart via the existing logging API | SATISFIED | Preset integrates with existing `GET /api/logger/presets` and `POST /api/logger/adjustment` endpoints -- no new endpoints, no restart required |

No orphaned requirements found. REQUIREMENTS.md maps PRES-01 and PRES-02 to Phase 3, and both are claimed by 03-01-PLAN.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/metabase/logger/api.clj` | 21, 200, 243 | TODO comments | Info | Pre-existing TODOs from Cam (2025-11-25) about response schemas -- not introduced by this phase, no impact |

No blocker or warning-level anti-patterns found. No stubs, no placeholder implementations, no empty handlers.

### Human Verification Required

### 1. Preset Appears in Admin UI

**Test:** Log into Metabase as admin, navigate to Admin > Tools > Logs, check presets dropdown
**Expected:** "Analytics query logging" appears as a selectable preset alongside the existing three presets
**Why human:** UI rendering and preset display cannot be verified programmatically without running the full application

### 2. Enabling Preset Activates Detail Logging

**Test:** Select the "Analytics query logging" preset, apply it, then run a query against a connected database
**Expected:** DEBUG log lines with full SQL, parameters, and timing appear in the admin logs viewer
**Why human:** Requires full application stack with database connection to verify end-to-end flow

### Gaps Summary

No gaps found. All three observable truths are verified. Both required artifacts exist, are substantive (not stubs), and are wired into the existing preset system. Both requirements (PRES-01, PRES-02) are satisfied. The implementation follows the identical pattern used by the three existing presets (sync, linkedfilters, serialization).

---

_Verified: 2026-03-12T20:00:00Z_
_Verifier: Claude (gsd-verifier)_

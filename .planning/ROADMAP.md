# Roadmap: Structured Query Logging

## Overview

This roadmap delivers structured query logging for Metabase in three phases. Phase 1 establishes correlation ID propagation and the always-on INFO summary log line with full query attribution -- this is the foundation that makes all subsequent logging useful. Phase 2 adds per-statement DEBUG logging in the JDBC execution layer, giving users full SQL visibility. Phase 3 wires the new logging into Metabase's existing preset system so admins can toggle detail levels at runtime without restart.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Correlation and Summary Logging** - Request correlation IDs and always-on INFO summary line with query attribution
- [ ] **Phase 2: Per-Statement Detail Logging** - DEBUG-level log lines with full SQL, parameters, and timing for each JDBC statement
- [ ] **Phase 3: Logging Presets** - Runtime toggle of detail logging via the existing admin preset system

## Phase Details

### Phase 1: Correlation and Summary Logging
**Goal**: Users can see a single, useful INFO log line per query request that identifies who ran what, where, and how long it took -- correlated by a request ID that works under concurrency
**Depends on**: Nothing (first phase)
**Requirements**: CORR-01, CORR-02, SUMM-01, SUMM-02, SUMM-03, ATTR-01, ATTR-02, ATTR-03
**Success Criteria** (what must be TRUE):
  1. After any query execution, an INFO log line appears containing request ID, database ID, user ID, query count, and total execution time
  2. When a query is triggered by a saved question or dashboard, the log line includes the card ID and/or dashboard ID
  3. Log lines from the same request share a single correlation ID that can be grepped to isolate that request's logs
  4. Two concurrent requests produce log lines with distinct correlation IDs (no cross-request leakage)
  5. Summary log lines use the standard Metabase log format and add negligible overhead (sub-0.1ms)
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md -- Query-log middleware with ThreadContext correlation and INFO summary line

### Phase 2: Per-Statement Detail Logging
**Goal**: Users can see the exact SQL and parameters Metabase sends to their database for every statement in a request, correlated to the summary line
**Depends on**: Phase 1
**Requirements**: DETL-01, DETL-02, DETL-03
**Success Criteria** (what must be TRUE):
  1. When detail logging is enabled, each SQL statement executed during a request produces a DEBUG log line containing full compiled SQL, parameter values, individual execution time, and database ID
  2. Detail log lines share the same correlation ID as the request's summary line, so grepping the request ID shows both summary and detail together
  3. Detail log lines use the standard Metabase log format
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Logging Presets
**Goal**: Admins can enable and disable detailed query logging at runtime through the existing Metabase admin UI, without restart
**Depends on**: Phase 1, Phase 2
**Requirements**: PRES-01, PRES-02
**Success Criteria** (what must be TRUE):
  1. An "Analytics query logging" preset appears in the admin logging UI and, when enabled, activates DEBUG-level per-statement logging for user-facing database queries
  2. Admins can enable and disable the preset via the existing logging API without restarting Metabase
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Correlation and Summary Logging | 1/1 | Complete | 2026-03-12 |
| 2. Per-Statement Detail Logging | 0/1 | Not started | - |
| 3. Logging Presets | 0/1 | Not started | - |

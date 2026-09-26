# Pilot kill matrix — 19 mechanically-reverted recent bugs (2026-07-08)

Population: the 19/84 most-recent repro-test issues whose fix commits revert cleanly
onto master. Mutation = inverse patch of the fix's product code (test files kept).
"Kill" = suite fails on mutated tree AND passes on clean tree (flaky suites discounted:
FormDateInput, SmartScalar/compute fail on clean master locally).

| Issue | Area (fix)                     | e2e repro   | FE unit (jest)      | BE unit             |
|-------|--------------------------------|-------------|---------------------|---------------------|
| 61457 | SDK dashboard viz settings     | not run     | **KILL** (1 suite)  | n/a                 |
| 63026 | ECharts tooltip CSS            | not run     | untestable (CSS)    | n/a                 |
| 63416 | Log levels modal               | not run     | **KILL** (1)        | n/a                 |
| 63537 | Metrics dimension picker       | not run     | **KILL** (2)        | n/a                 |
| 64368 | Dashboard param actions        | not run     | **KILL** (2)        | n/a                 |
| 64473 | Transform viz details button   | not run     | MISS → **CLOSED**¹  | n/a                 |
| 65908 | Dashboard grid height (hidden) | not run     | MISS → **CLOSED**¹  | n/a                 |
| 66670 | Dashboard revision revert      | **KILL** ✔  | n/a                 | **KILL** (2 tests) ✔|
| 66742 | Tenants listing                | not run     | **KILL** (1)        | n/a                 |
| 66957 | Filters header in detail view  | not run     | MISS → **CLOSED**¹  | n/a                 |
| 67903 | Notebook preview (CSS contain) | not run     | MISS (CSS-adjacent)²| n/a                 |
| 69160 | Admin settings widgets         | not run     | **KILL** (3)        | n/a                 |
| 70311 | lib parameter schema (cljc)    | not run     | n/a (cljs stale)    | **KILL** (1 test) ✔ |
| 70451 | dependency bump                | — excluded —                                              |
| 70647 | Table editing date input (EE)  | not run     | MISS → **CLOSED**¹  | n/a                 |
| 71488 | Funnel viz translation         | not run     | **KILL** (1)        | n/a                 |
| 74433 | Tooltip CSS                    | not run     | untestable (CSS)    | n/a                 |
| 74461 | Tenant collection deletion     | not run     | **KILL** (1)        | **KILL** (1) ✔      |
| 76710 | Tables redux (FK to hidden)    | not run     | **KILL** (1)        | n/a                 |

✔ = clean-tree baseline explicitly confirmed. All FE kills baseline-confirmed as a batch.
e2e "not run" = only 66670's e2e leg was executed (mechanism validation); others pending.

¹ Hole CLOSED by a targeted unit test (each verified kill: FAILS on the `-R` mutated
  tree, PASSES on clean; see each `bugs/<issue>/config.yaml` `hole_closed`). The MISS
  still stands as an observation (no *shipped* related test catches the bug), but the
  regression is now guarded at unit level, so its e2e repro test becomes cullable.
    - 66957 → `ViewTitleHeader.unit.spec.tsx` (filter pills visible in object-detail view)
    - 70647 → `TableActionInputDate.unit.spec.tsx` (onChange fires with restored date)
    - 65908 → `GridLayout.unit.spec.tsx` (container height 220px, not 11220px, w/ hidden card)
    - 64473 → `QueryEditorVisualization.unit.spec.tsx` (no detail-shortcut buttons in dataset mode)
  All four author'd + verified this session; the 3 non-66957 tests came from parallel
  subagents, kill-verified serially on the shared tree.

² 67903 (notebook-preview `contain: strict`) is CSS-adjacent — the only unit hook is a
  className-presence assertion, which is weak. Left OPEN: reclassify with the CSS-only
  entries (keep e2e/visual coverage) rather than close with a meaningless test.

## Headline numbers

- **11/18 unit-killed** (9 jest + 70311 BE; 66670 BE; 74461 both) — deleting these bugs'
  e2e tests loses no detection power at unit level (e2e still adds browser-integration
  signal).
- **5/18 genuine unit holes** (64473, 65908, 66957, 67903, 70647): thousands of related
  *shipped* unit tests pass with the bug live. UPDATE: **4/5 now CLOSED** with targeted
  unit tests written + kill-verified this session (64473, 65908, 66957, 70647) — proving
  these holes were cheaply closable and their e2e repro tests are now cullable. The 5th
  (67903) is CSS-adjacent → keep e2e/visual coverage.
- **2/18 CSS-only** (63026, 74433) — categorically unit-untestable; keep e2e/visual
  coverage for styling fixes. (67903 effectively joins this bucket → 3 CSS-ish.)

## Biases (do not over-read)

- Clean-revert population skews to small, recent, single-file fixes — likely the
  best-unit-covered subset. The conflicted 75% (multi-file, boundary bugs) is unmeasured
  until the semantic-reconstruction leg exists.
- Killing unit tests often shipped with the fix. Right measurement for culling
  ("guarded now"), not for historical detection power.

## Next steps

- e2e sanity leg for the 5 misses + 2 CSS entries (confirm the e2e repro DOES catch
  them — completes their rows). FE mutations hot-reload via dev server.
- Inspect the 5 miss fix-diffs; write targeted unit tests where feasible.
- Semantic-reconstruction leg for conflicted reverts (the real population).

---

## Full-population extension — 18 new clean-reverters (session 2)

After the full-population revert scan (clean rate **3.0%**, not the pilot's 23% — recency
bias), 18 new clean-reverting fixes were materialized + coverage-classified with the
hardened `coverage-leg.sh`, then **isolation-baseline-confirmed** (mutate → run each
candidate's non-flaky failing files in isolation) to separate real kills from load-flakes.

| Issue | Fix (subject, abbshort)               | FE unit  | BE unit | Verdict |
|-------|---------------------------------------|----------|---------|---------|
| 5334  | pie Other-slice drill-through (cljc)  | **KILL** | **KILL**| kill    |
| 56839 | FK dropdown filtering                 | **KILL** | —       | kill    |
| 33084 | run actions for different objects     | MISS     | —       | hole    |
| 34226 | search dismiss on pathname (#37669)   | MISS     | —       | hole (dup 35009) |
| 35009 | search dismiss on pathname (#37669)   | MISS     | —       | hole (dup 34226) |
| 42723 | preserve viz settings on drill        | MISS¹    | —       | hole    |
| 44499 | bookmark list on archive              | MISS¹    | —       | hole    |
| 46177 | filter widget reset-to-default        | MISS     | —       | hole    |
| 46372 | autoconnect message scroll            | MISS     | —       | hole    |
| 47005 | breadcrumbs for nested questions      | MISS¹    | —       | hole    |
| 49319 | ignore unsaved params in dash exec    | MISS¹    | —       | hole    |
| 55484 | clear settings after drillthrough     | MISS     | —       | hole    |
| 55673 | close table header popover w/ escape  | MISS     | —       | hole    |
| 56905 | cmd+enter with inputs focused         | MISS     | —       | hole    |
| 56913 | native+vars → model error modal       | MISS     | —       | hole    |
| 57685 | allow empty column aliases            | MISS     | MISS    | hole    |
| 45359 | e2e font (FormFileInput.stores.tsx)   | untest²  | —       | verify  |
| 59306 | max-width multi-input (module.css)    | untest(CSS)| —     | keep-e2e|

¹ raw `findRelatedTests` reported `fe_exit=1`, but that was a **load-flake** under the
  9.8k–11.4k-test run (FormDateInput/heavy integration suites). Isolation re-run: all pass
  on the mutated tree → **MISS**, not kill. This is why isolation-baseline-confirm is
  mandatory: 4 of 6 raw kill-candidates were load-flake false positives.
² no importing unit tests (`.stores.tsx`); subject is e2e test-infra — verify it's a real
  product regression before trusting.

### Corpus-wide rollup (all 37 clean-reverter entries)

- **13 unit-killed** (shipped unit tests catch the bug): 5334, 56839, 61457, 63416, 63537,
  64368, 66670, 66742, 69160, 70311, 71488, 74461, 76710.
- **19 unit holes** (no *shipped* unit test catches it) — **4 now CLOSED** with targeted
  tests this session (64473, 65908, 66957, 70647); **15 still open**.
- **4 untestable-at-unit** (CSS / no importing tests): 63026, 74433, 59306, 45359.
- **1 excluded** (70451 dep bump).
- **Hole rate among clean-reverters ≈ 53%** (19/36) — even the cleanly-revertible,
  well-covered subset is half-unguarded at unit level. Expect the conflicted 97%
  (semantic-reconstruction population) to be worse.

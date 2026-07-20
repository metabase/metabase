# source-replacement (slot 4, port 4104) — QA-database tier

Source: `e2e/test/scenarios/data-studio/data-model/source-replacement.cy.spec.ts` (1481 lines)
Target: `e2e-playwright/tests/source-replacement.spec.ts` + `support/source-replacement.ts`

## Counts — executed vs gate-skipped

**All 29 runnable tests EXECUTED against the real writable-Postgres container.
Zero gate-skips.**

| | count |
|---|---|
| Executed and passing | **29** |
| Gate-skipped (`PW_QA_DB_ENABLED` / token) | **0** |
| Skipped because upstream skips it (`it.skip` → `test.skip`) | 1 |
| `test.fixme` | 0 |

Final full run: `29 passed, 1 skipped` (3.0m). Earlier `--repeat-each=2` full run:
`58 passed, 2 skipped` (6.1m). `bunx tsc --noEmit` clean.

The QA-DB path is definitely exercised: every test does
`queryWritableDB` DDL → `resyncDatabase(WRITABLE_DB_ID)` → real
`POST /api/ee/replacement/replace-source` run polled to `succeeded`, and the
assertions read rows out of the writable Postgres tables. The tier gate is real,
not decorative — with `PW_QA_DB_ENABLED` unset the whole describe skips, which is
exactly the "green run that ran nothing" failure mode, so the counts above are
the number that matters.

## Fixes needed (4), all classified

### 1. Sync race — upstream's `resyncDatabase({ dbId })` gates on nothing (harness-speed, NEW gotcha)
`H.resyncDatabase({ dbId })` with no `tables` returns as soon as the DB has **any**
synced table — which is immediately, because the snapshot's own tables satisfy it.
Cypress survived that because its command queue put seconds between the resync and
the first `getTableId`; Playwright's back-to-back API calls do not.

Fingerprint is two-staged and misleading: first `Table with name source_table
cannot be found`, then (once the table row exists) `Field with name amount cannot
be found on table 235` — the second reads like a *product* metadata bug rather
than "the sync is still running". 27/30 tests failed this way on run 1.

Fix: pass the tables the helper just created (`tables: [...], retrigger: true`) —
the same helper's own documented option, so no new machinery.
**Generalisable:** any port calling `resyncDatabase` without `tables` has this
hole; the argument-less form is a no-op gate.

### 2. `writable_db` is shared and CONTAMINATED — the table picker grows a schema level
Upstream clicks database → table directly in `H.DataModel.TablePicker`, because a
clean writable Postgres has exactly one schema (`public`) and the picker collapses
that level away. Measured on this box:

```
Domestic, Schema A … Schema Z, Wild, public   (28 user schemas)
```

so the picker renders a schema level and `getTable("Source Table")` matches
nothing. This is the **same contamination the coordinator flagged**, reached
independently from the other end (picker depth rather than checkbox tri-state).

Fix (deliberately non-destructive — I did **not** drop foreign schemas, three
QA-DB agents are live): expand `public` *only when a schema level is present*, so
the port is a no-op in the clean/CI shape and correct in the polluted one.

I'd add one point to the evidence the coordinator is collecting: the failure did
**not** read as a product bug here, it read as *port drift* — "my locator is
wrong" — which is the more expensive misdiagnosis, because it sends you into the
Cypress helper rather than into the container. The cheap discriminator is
`select schema_name from information_schema.schemata` against the container, and
it should probably be step 1 of any QA-DB debug.

### 3. Entity-picker search needed a backend index gate AND a re-nudge (two distinct causes)
Both were mistaken for each other; worth separating.

**(a) Index lag.** The picker searches through `/api/search`, which is
index-backed, and the target tables are created *inside* the test. Poll the
backend until the table is searchable before driving the FE (PORTING's
"poll the index before the FE read" rule). Note the result item's humanized name
lands in **`name`**, not `display_name` — my first predicate keyed on
`display_name`, got 0 for everything, and produced 8 confident "should be
searchable" timeouts that looked like an index problem and were a *me* problem.
Cross-checking the raw `/api/search` body took 2 minutes and would have saved 20.

**(b) The picker sometimes stays on its root list.** `use-switch-to-search-folder.ts`
switches into the "search results" folder from an effect watching the **debounced**
query. Typing into a freshly-mounted picker occasionally leaves it on root: the
searchbox holds the full text and the root list merely offers a
`Search results for "X"` **link**, so `result-item` never renders. 3/30 on one
run. Awaiting the `/api/search` response does **not** fix it — the response
arrives, the path switch is what's lost. Fixed with the documented re-nudge
(clear + retype inside `toPass`); the assertion is unchanged.

### 4. `cy.wait("@replaceSource")` → the response must be registered before the confirm click
Ordinary rule-2 inversion, but it changes the call shape: `confirmReplacement`
returns the pending `POST /api/ee/replacement/replace-source` response and
`waitForReplacementToComplete` consumes it, preserving upstream's two-call
structure at all 12 call sites.

## Mutation testing — 4 mutants, 4 killed

Absence assertions are the vacuity risk here, so each was inverted by corrupting
the **expectation** (never by shrinking input and expectation together).

| # | Mutation | Result |
|---|---|---|
| M1 | absence text `SOURCE_ROW_VALUE` → `COMPATIBLE_TARGET_ROW_VALUE` (a value that IS present) | **killed** — `toHaveCount` failed |
| M2 | segment "no longer on source" check pointed at `targetTableId` (where it IS present) | **killed** — `not.toContainText` failed |
| M3 | same for the measure list | **killed** |
| M4 | `assertDashcardHasRows` `hidden: [COMPATIBLE_TARGET_ROW_VALUE]` → `[ANOTHER_TARGET_ROW_VALUE]` (a visible row) | **killed** — `toHaveCount` failed |

So the `toHaveCount(0)` and `not.toContainText` assertions are live, not vacuous.
They are anchored as PORTING requires: each absence check follows a positive
signal present in both variants (`assertTargetRowVisible`, or the list's own
`toBeVisible`, which is Cypress's implicit `findByTestId` existence assertion made
explicit).

## Unexplained — intermittent post-replacement query failure (NOT fixed, NOT diagnosed)

~3 occurrences in ~200 test executions, on three different tests, always the same
shape: the first question/dashcard query issued *after* a successful replacement
renders `There was a problem with your question` / `There was a problem displaying
this chart` (0 rows, 0ms).

What I did and did not establish:
- It does **not** reproduce in isolation: 6/6, 10/10 and 16/16 targeted repeats of
  the two implicated tests all passed. It has only ever appeared inside a long
  sequential run.
- I instrumented `page.on("response")` over `/api/dataset` and every `…/query`
  endpoint and **never captured an error body** — on the one run where it
  recurred, the logger was scoped to card queries and the failure was a *dashcard*
  query, so the body was missed. I did not get a second chance within budget.
- I therefore cannot say whether it is a backend race (metadata/`result_metadata`
  transiently inconsistent while the replacement's sync settles) or an artifact of
  five agents sharing one Postgres container. **I am recording it as unexplained
  rather than picking one.** No fixme was added — the spec is green as it stands
  and I will not weaken an assertion to hide a flake I can't characterise.

If someone picks this up: log the full `/api/dashboard/:id/dashcard/:x/card/:y/query`
body across a full sequential run, that is the missing datum.

## Not encountered

The two sibling warnings did not bite this port: it uses no `click({ force: true })`
(so no real-mouse-vs-dispatch divergence) and no Mantine `Select` option rows.

## Consolidation debt

- `support/source-replacement.ts` carries database-parameterised
  `visitDataStudioSegments` / `visitDataStudioMeasures`. The existing copies in
  `segments-data-studio.ts` and `measures-data-studio.ts` hardcode `SAMPLE_DB_ID`
  in their URL builders and so cannot be reused against `WRITABLE_DB_ID`. Cypress
  has **one** helper for each, taking `{databaseId, schemaId, tableId}` — so
  parameterising the shared copies is a strictly faithful consolidation.
- `SourceReplacement.*` is a fresh port of the Cypress `H.DataModel.SourceReplacement`
  surface; it belongs next to the rest of `DataModel` in `support/data-model.ts`
  once parallel agents are done with that file.

## 3-line summary

Ported all 30 upstream tests; **29 executed for real against the writable-Postgres
container and pass, 0 gate-skipped**, 1 skipped because upstream skips it — tsc clean,
green twice over including `--repeat-each=2`.
Four fixes were needed, of which two are new generalisable gotchas: `resyncDatabase`
without `tables` gates on nothing, and the shared `writable_db`'s accumulated schemas
add a picker level that reads as port drift rather than as contamination.
Four mutation probes on the absence assertions were all killed, so nothing here is
vacuous; one intermittent post-replacement query failure (~3 in ~200) resisted every
attempt to reproduce or capture and is recorded as unexplained rather than guessed at.

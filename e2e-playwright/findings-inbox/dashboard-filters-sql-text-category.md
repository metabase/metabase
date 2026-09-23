# dashboard-filters-sql-text-category — port findings (slot 2, port 4102)

Source: `e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-text-category.cy.spec.js` (133 lines, 1 test)
Target: `e2e-playwright/tests/dashboard-filters-sql-text-category.spec.ts`
Support: `e2e-playwright/support/dashboard-filters-sql-text-category.ts` — **this IS the expected name**, no deviation to report.

## Collision checks

- `grep -rl "dashboard-filters-sql-text-category" tests/ support/` → **no hits**. No prior port of this source.
- `ls tests/ | grep -iE "sql-text|68998|text-category"` → only `dashboard-filters-text-category.spec.ts`, which is a port of the **different** upstream file `dashboard-filters-text-category.cy.spec.js` (the DASHBOARD_TEXT_FILTERS matrix). Disjoint: it shares no issue number and no describe with mine. Read it read-only; did not touch it.
- No shared support module was edited. New file only. `PORTED.txt` / `QUEUE.md` / `playwright.config.ts` untouched. Nothing committed. Port 4000 never used.

Everything the spec needs already existed and is imported read-only:
`setFilter` / `saveDashboard` / `filterWidget` / `getDashboardCard` / `editDashboard` (dashboard.ts),
`createNativeQuestion` / `createNativeQuestionAndDashboard` (factories.ts),
`showDashcardVisualizerModal` / `saveDashcardVisualizerModal` / `switchToAddMoreData` / `switchToColumnsList` / `selectDataset` (visualizer-basics.ts),
`dashboardParametersDoneButton` (filters-repros-2.ts), `dashboardParametersPopover` (dashboard-core.ts), `modal` / `popover` (ui.ts), `queryQaDB` (collections-uploads.ts).

The new module holds only what had no home: `PG_DB_ID`, the skip reason, `SQL_QUERY_DETAILS`, and ports of `H.queryQADB` / `H.getTableId` / `H.getFieldId` (`getTableId`/`getFieldId` exist elsewhere in `support/` but every copy is a *different* helper — schema-viewer's, table-editing's, data-studio's — none is the `e2e-qa-databases-helpers.js` pair this spec calls).

## What the `beforeEach` restores

`H.restore("postgres-12")` → `mb.restore("postgres-12")`, plus `signInAsAdmin`.

Then it **mutates the warehouse**: `UPDATE PRODUCTS SET CATEGORY = 'New Category' where CATEGORY = 'Doohickey'` against the QA postgres. `afterEach` reverts it.

`WRITABLE_DB_ID` check (the brief's warning): **checked the mechanism, and it is the benign case here.** `H.getTableId` defaults `databaseId` to `WRITABLE_DB_ID`, which is the literal `2`. Under `postgres-12` database 2 is the read-only **QA Postgres12 sample** (`sample` on :5404), not `writable_db`. That is also exactly the spec's own `PG_DB_ID = 2`, so the default and the explicit constant agree. Verified empirically, not by assumption: `getTableId({name:"products"})` resolves, `getFieldId` finds `category`, and a native card built on `PG_DB_ID` renders `New Category` — which only the QA postgres sample contains. **The never-reset `writable_db` warehouse is not touched by this spec at all**, so the accumulating-debris hazard is inapplicable here.

🔴 **But the QA `sample` database IS shared across slots**, and this spec writes to it. For the ~2s duration of the test, any other slot querying database 2 sees `New Category` instead of `Doohickey`. Upstream has the identical property but Cypress runs the file serially; our harness does not. Nothing in the port can fix this without diverging from the source. Documented in the support module. Post-run state verified clean:
`Doohickey 42 / Gadget 53 / Gizmo 51 / Widget 54`, no `New Category` or `Other Category` rows left behind.

Self-healing note: the UPDATE is keyed on `CATEGORY = 'Doohickey'`, so a crash mid-test leaves rows as `New Category`, the next `beforeEach` is a no-op, and its `afterEach` still restores. Not a permanent-debris shape.

## Gate mapping + gate-OFF control

Upstream tag: `{ tags: "@external" }`. The tag is corroborated by the `beforeEach` (I read it rather than trusting the tag): `restore("postgres-12")` + `queryQADB` + a card on database 2 all genuinely require the QA Postgres container. Tag and reality agree — no discrepancy to report.

Gate: `test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON)` at **DESCRIBE level**. This describe **has an `afterEach`**, so per the brief's rule the gate must be describe-level — a `beforeEach`-level skip would still let the `afterEach` fire and open a knex connection to a container that isn't there.

**Gate-OFF control (`PW_QA_DB_ENABLED` unset):**
```
  -  1 [chromium] › ... › should show all available category options ...
  1 skipped
```
Skipped, and notably **no backend was booted at all** (no `[worker 0 slot 0] backend on :4102` line), confirming the describe-level skip fires before any fixture or hook work.

**Gate-ON:** 1 passed (2.6s), and `--repeat-each=3` → 3 passed (2.3s each).

## Absence assertions

**There are none.** Every one of the four upstream assertions is `should("exist")` — positive presence. So the "zero-assertion satisfied on its first poll" hazard is **inapplicable to this spec**; I checked each assertion individually rather than eyeballing the file.

The only `toHaveCount(0)` calls in the executed path belong to shared helpers, and both already carry a positive anchor:
- `showDashcardVisualizerModal` asserts `expect(dialog).toBeVisible()` *before* its two loader `toHaveCount(0)` checks (its own inline comment says exactly why).
- `saveDashcardVisualizerModal` does `toHaveCount(0)` on the modal, anchored by the preceding successful click on the modal's own "Save" text.

I did not add either; I verified they hold.

## The 2.6s runtime — checked, not hand-waved

A 2.6s pass on a spec that restores a snapshot, creates two native cards, opens the visualizer modal and saves a dashboard looked wrong, so I probed it rather than accepting the green. I injected a `ZZZ_SANITY_PROBE` string into the first modal assertion; the run failed at that exact line after reaching it, proving the body executes through the visualizer flow. The speed is real (warm reused backend on :4102, everything before the UI is API-driven, `selectDataset` waits on one card query). **Ruled out**: gate mis-skip, hollow pass, un-executed body.

## Mutation testing

Verifier: `scratchpad/s2-df-sql-text-mutate.py`. **Sanity-checked before use**, with three deliberately-bad mutants injected into a copy:

| bad mutant | result | spec md5 after |
|---|---|---|
| anchor with 0 occurrences | `ABORT: anchor not found`, exit 1 | unchanged |
| anchor with 4 occurrences | `ABORT: anchor ambiguous (4 sites)`, exit 1 | unchanged |
| no-op replacement | `ABORT: no-op replacement`, exit 1 | unchanged |

All validation runs before any write, so an abort cannot leave a half-written file. It also prints md5 before/after, which is how each apply below is confirmed to have landed.

| # | mutation | landed (md5 changed) | result | died at |
|---|---|---|---|---|
| M1 | **change the filter value**: `beforeEach` renames Doohickey → `'Other Category'` (and `afterEach` reverts from `'Other Category'`), so the data no longer contains the string the assertions name | ✅ `1546…` → `a413…` | **killed** (11.7s) | line **153** — the modal's `New Category` assertion, the first assertion naming the value |
| M2 | **tail-aimed**: drop the SECOND parameter mapping (`.nth(2)` + its popover click), leaving the postgres dataset unwired to the filter | ✅ `1546…` → `aba6…` | **killed** (12.3s) | line **180** of the mutant = original line **188**, the **final dropdown assertion** |
| M3 | drop `selectDataset("SQL- Postgres")` so the card has one dataset | ✅ `1546…` → `2797…` | **killed** (11.3s) | line **152** of the mutant = original **153** |

M1 is the brief's prescribed input-inversion. It kills, but **it kills early** — line 153, not the tail — so on its own it says nothing about the final dropdown assertion. That is why M2 exists, and M2 is the load-bearing result: it leaves every modal assertion satisfied and is visible *only* to the last assertion, which is precisely the regression issue 68998 is about (values from the second dataset reaching the filter dropdown). **The final assertion discriminates.** No mutant survived, so the "presence probe to separate vacuous from non-discriminating" step was not needed.

Runtime as a tell: all three mutants took 11–12s vs the 2.2–2.6s baseline. That difference is entirely the 10s `toBeVisible` timeout, i.e. each died by genuine assertion failure rather than by an early structural break — the shape I wanted.

**Bad mutation to call out on myself:** M3 is weak. It kills, but it kills at the same assertion M1 does, so it adds almost no information beyond M1 — and because removing the dataset also changes what `switchToColumnsList` closes over, its failure is slightly over-determined. I kept the result for completeness but I would not count it as independent evidence.

**Restoration:** after every mutant the spec was restored from a pristine copy and re-hashed. Final `md5 = 154698f4f6daab9f1288391d216fa43c`, **byte-identical to pre-mutation**. Confirmed after each of the three runs and again at the end.

## Mapping notes / hazards from the brief

- `should("be.enabled")`: **not present** — inapplicable.
- `getByText` exactness: all four `cy.findByText` calls are testing-library exact-by-default, ported as `{ exact: true }` — the faithful direction per the brief. No `{exact:false}` anywhere, so the case-insensitivity trap is inapplicable.
- `.contains()` innermost-descendant: **not present** — the spec uses `findByText` only.
- `should("contain", …)` any-of vs concatenation: **not present**.
- `pressSequentially` caret-0: no typing in this spec's own body. (`selectDataset` uses it internally on a search box it first `fill("")`s — shared helper, not mine.)
- CodeMirror `{Enter}` completion-accept: the SQL is created **via the API**, never typed into the editor — inapplicable.
- Virtualized-list ~20 rows: no count or list-exhaustion assertion here — inapplicable.
- Filter value in the URL: upstream never asserts `toHaveURL`, and never actually *applies* a filter value — it only opens the dropdown and checks an option is offered. So there is no URL to assert alongside, and the `last_used_param_values` persistence hazard is inapplicable (no parameter is ever submitted).

## Deliberate deviations (strengthenings)

1. `should("exist")` → `toBeVisible()` on all four assertions. `should("exist")` is strictly weaker — testing-library's `getByText` matches hidden nodes too. Each target is a node the user is meant to see (an "Add more data" button label, a column-list entry, a canvas legend, a dropdown option), and the visibility requirement is what keeps them from passing on a detached-but-present node. **Stated here because it is a strengthening, not a like-for-like port.**
2. `cy.intercept("POST", "/api/card/*/query").as("cardQuery")` is registered upstream and **never waited on** — there is no `cy.wait("@cardQuery")` in the file. Ported as a comment. A `waitForResponse` with no await would be a floating promise in Playwright, i.e. worse than the upstream no-op.

Nothing was dropped, weakened, or merged.

## fixmes

None. No `fixme`/`skip` markers in the port.

## tsc

`bunx tsc --noEmit` → clean (exit 0), run from `e2e-playwright/`, never the repo root.

Because **tsc is provably silent on dead imports**, I hand-audited all 24 imported symbols against the spec body (each must appear ≥2 times: import site + use site). Zero dead imports. The support module's two imports (`MetabaseApi` type, `queryQaDB`) are both used, and all six of its exports are consumed by the spec.

## Open questions / unexplained

None outstanding. The one thing I probed and resolved rather than assumed was the 2.6s runtime (see above). I did **not** inherit `dashboard-filters-text-category.ts`'s explanation of anything — that sibling ports a different upstream file with a different mechanism (a filter-value matrix with a `negativeASsertion` typo), and none of its reasoning applies here.

Jar verified **by identity**, not by `JAR_PATH`: `version.properties` inside `target/uberjar/metabase.jar` reads `hash=751c2a9`, matching COMMIT-ID `751c2a98`.

## Summary

Clean one-test port of issue 68998; green first run, stable under `--repeat-each=3`, tsc clean, no shared support module touched and no collision with the pre-existing `dashboard-filters-text-category` port.
Gate is describe-level on `PW_QA_DB_ENABLED` because the describe has an `afterEach`; the gate-OFF control skips without even booting a backend, and the gate-ON control executes.
All three mutants died — critically M2, which is invisible to every assertion except the final dropdown check, proving the tail assertion is load-bearing; spec restored byte-identical (md5 `154698f4f6daab9f1288391d216fa43c`).

# dashboard-filters-source

Port of `e2e/test/scenarios/dashboard-filters/dashboard-filters-source.cy.spec.js`
(418 lines, 11 tests) → `tests/dashboard-filters-source.spec.ts`.
Support module: **`support/dashboard-filters-source.ts`** (matches the spec name).

Result: **11/11 green**, **33/33 under `--repeat-each=3`**, tsc clean, every test
killed by at least one mutant. No fixmes. No product-bug claims.

## Collision checks

- `grep -rl "dashboard-filters-source" tests/ support/` → **no hits** before I
  started. No existing or uncommitted port of my source.
- Near-neighbours that exist and were **not** touched: `dashboard-filters-number-source.spec.ts`,
  `sql-filters-source.spec.ts`, `dashboard-filters-boolean.spec.ts` (the sibling
  being written live). I read `number-source` for house style and imported
  `setDropdownFilterType` / `setSearchBoxFilterType` from `sql-filters-source.ts`
  read-only. No shared support module was edited.
- Support module name is `support/dashboard-filters-source.ts` — i.e. **matching**
  the spec basename, so no dangling-import hazard.

## Gate — probed, not read

The queue labels this spec `@external`. **That is only half right, and taking it
at face value would have skipped 9 of 11 tests.** Only the *second* describe
("exotic types") carries `@external` upstream; it restores `postgres-writable`
and drives the writable QA postgres container. The first describe is `@slow` and
runs entirely on the H2 sample DB.

So the skip is scoped to the exotic-types describe only. **Gate-OFF control**
(same command, `PW_QA_DB_ENABLED` unset):

| run | executed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` | **11** | 0 |
| gate OFF | **9** | **2** (both exotic-types) |

That is the split the tiering predicts, so the gate is placed correctly rather
than accidentally covering everything.

### WRITABLE_DB_ID is genuinely the writable container *here*

Per the brief's caution I checked the snapshot rather than the constant. This
describe restores **`postgres-writable`** (not `postgres-12`), under which
database 2 really is the writable container. This is not just inference: the
`beforeEach` does `getTable(... name: "ip_addresses")` against db 2, and
`getTable` **throws** when the table is absent. `ip_addresses` exists only in
`writable_db`, so the two green tests are positive runtime proof that db 2 is the
writable container. `getTable` also pins `schema: "public"` (#85 debris).

## Fixture ids — every one, and where it was read from

Nothing hardcoded; all read at import time from the generated fixture.

| id | value | source |
|---|---|---|
| `PRODUCTS_ID` | 7 | `SAMPLE_DATABASE` → `e2e/support/cypress_sample_database.json` |
| `PRODUCTS.CATEGORY` | 61 | same |
| `WRITABLE_DB_ID` | 2 | `support/schema-viewer.ts` (mirrors `cypress_data.js`), snapshot-verified above |
| `ip_addresses` table id | resolved at runtime | `getTable(...)`, schema-pinned — never guessed |
| `count` field id | resolved at runtime | `table.fields.find(f => f.name === "count")`, with an explicit throw if absent |

I derived no id by name that the fixture already had, and guessed none. The
source/target *questions* are created per-test, so no `ORDERS_*` constants are
involved at all.

## Value lists flagged for CI drift

CI builds a merge commit, so sample-data-derived literals are the class that can
differ. Flagged (all in the spec header too):

- **200** — every PRODUCTS row (scalar target card).
- **51** — PRODUCTS rows with `CATEGORY = 'Gizmo'`.
- **"Rustic Paper Wallet"** — the PRODUCTS title at ID 1, used by both
  number/id label tests.

**Ordering question — answered, and it is safe.** The brief asked whether any
value list depends on order, and whether that order is guaranteed or incidental.
The one ordering-sensitive list is `numberLabelSource`
(`SELECT ID, TITLE FROM PRODUCTS ORDER BY ID ASC LIMIT 5`). The order is
**guaranteed by the query's own ORDER BY**, not incidental — proven by mutation C
below, where flipping `ASC`→`DESC` reliably killed both dependent tests. No
mongo-style unsorted dependency here.

## Virtualization — checked, does not apply

The brief flagged the filter-values dropdown as the right shape for the
"target was never in the DOM" failure. It did not bite: every dropdown in this
spec holds **3–4 options** (three product categories, or a 3-entry custom list),
far below any windowing threshold, and no assertion needed scrolling or search
to reach its target. **Not triggered by any failure mode I could induce** — the
`toHaveCount(0)` mutants all failed by *finding* the element, not by under-render.
Recording this as "did not apply" rather than banking it as a dividend.

## Mutation testing — 8 mutants, all killed, every test covered

Input mutated in every case, never the expectation. Spec restored **byte-identical**
(md5 `35b6df030e138ac928b2a8f4e45262dd` for the spec, `c2edb4a3c21d344effe71acb412c08d7`
for the support module — both re-verified after restoration).

| # | mutation (input) | target | result / where it died |
|---|---|---|---|
| A | source card excludes `Gadget` not `Doohickey` | structured source | **killed** — `Doohickey` absence assertion |
| A2 | source card excludes `Gizmo` | string/contains | **killed** — the `Gizmo` option click (30s timeout) |
| B | static list label `Gizmo Label`→`Gizmo Tag` | both static-list tests | **killed** — dropdown label; search test died at the typeahead `.last()` popover |
| C | `ORDER BY ID ASC`→`DESC` | number/string + id/string | **killed** both — "Rustic Paper Wallet" no longer in the top 5 |
| D | native source excludes `Gadget` | native source | **killed** — `Doohickey` absence |
| E | archive the *target* card instead of the source card | structured source **tail** | **killed** — archive-modal text |
| F | IP label `Router`→`Gateway` | exotic IP | **killed** — `Router` assertion |
| G | Quantity label `Twenty`→`Score` | exotic Quantity | **killed** — `Twenty` assertion |
| H | field source swapped for a card source (+ the card actually created) | field source | **killed** — `Doohickey` *presence* assertion |

**A mutant that survived, and why it was my bad mutation, not vacuity.**
Mutation A killed test 1 but left test 2 (`string/contains`) green. That is not a
hollow assertion: test 2 never observes the source list's *contents* — it asserts
the target card's counts (200 → 51) and clicks `Gizmo`, which mutation A leaves
present. I answered it the prescribed way, by aiming a mutation at what test 2
actually reads (A2, excluding `Gizmo`), which killed it at the click. So:
**bad mutation, not a vacuous test.** Calling my own out per the brief.

**Tail coverage.** Mutation A died at `filterDashboard`, which left test 1's
final `archiveQuestion` assertion unproven — exactly the failure mode the brief
warns about. Mutation E was aimed at that tail specifically and killed it. Worth
noting *why* that assertion is load-bearing: the sentence "It will also be
removed from the filter that uses it to populate values" is rendered by
`ArchiveCardModal.tsx getWarningMessage` **only when the card's
`parameter_usage_count` is exactly 1**. So it is a real check that the archived
card is the filter's value source, not merely a card on the dashboard — which is
precisely what mutation E inverted.

## Port notes / deviations

- **`support/dashboard.ts setFilterQuestionSource` is missing the `labelField`
  branch** of upstream `H.setFilterQuestionSource`
  (`e2e/support/helpers/e2e-filter-helpers.js:17`), which three tests need.
  Shared modules are off-limits, so my module carries a **superset** version.
  **Consolidation candidate:** fold `labelField` into the shared one and delete
  mine. Flagged in the module header.
- **`resetTestTable` has no `ip_addresses` case.** The existing port
  (`support/actions-on-dashboards.ts`) only knows `scoreboard_actions` /
  `many_data_types`, and its knex client is not exported. I rebuilt the table
  through the exported `queryWritableDB` with the same schema/rows as
  `e2e/support/test_tables.js:243` + `test_tables_data.js:56`. Note `count` is
  **TEXT** upstream (knex `table.text`) even though the rows insert integers, and
  `inet` needs raw DDL — both preserved, and both matter (the second test
  relabels `count` as `type/Quantity`).
- **Dropped intercept (rule 2):** `cy.intercept("POST","/api/dataset").as("dataset")`
  is registered in `beforeEach` and **never awaited anywhere in the file**. Same
  finding as the `number-source` port. So the brief's ResponseRecorder/queue rule
  genuinely did not apply here — saying so plainly rather than banking it.
- **`archiveQuestion` ported as `toHaveCount(1)`, not `toBeVisible()`.** Upstream
  is a bare `cy.findByText(...)`, which is an *existence* assertion; `toHaveCount(1)`
  is the faithful equivalent and also dodges the Mantine-modal `hidden` trap. This
  is faithful, **not** a strengthening.
- **Exact-match check.** The archive sentence is spliced from two msgids, which is
  the classic split-text-node trap for `exact: true`. I read
  `ArchiveCardModal.tsx` first: the pieces are concatenated into **one string**
  before render, so it is a single text node and `exact: true` is correct. Verified
  by mutation E failing on it rather than it silently never matching.
- **Testids verified present in the product** (brief: four bogus ones found today):
  `archive-button` (`QuestionMoreActionsMenu.tsx:36`), `fixed-width-filters`
  (`DashboardParameterPanel.tsx:57`), `token-field` (`TokenField.tsx:553`).
  All three real.
- `should("contain", x)` on the single `fixed-width-filters` element → `toContainText`.
  Single-element subject, so the any-of/concatenation distinction does not arise.
- The search-list filter uses `pressSequentially` (rule 5) — the list filters as
  you type.
- `setSearchFilter` handles the two coexisting popovers explicitly:
  `.last()` for the typeahead suggestion (as upstream), `.first()` for the widget
  popover afterwards, commented.

## Environment

- Jar verified **by identity**, not by `JAR_PATH`: backend on :4103 runs
  `-jar .../target/uberjar/metabase.jar`, and `/api/session/properties`
  `version.hash` = `751c2a9` vs `COMMIT-ID` `751c2a98`. (The run printed
  `(reused)`, which is exactly the case where `JAR_PATH` is silently ignored —
  hence the identity check.)
- No Cypress cross-check was run (standing rule — live sibling slots). **I
  therefore cannot say whether upstream passes or fails these same assertions,
  and I am not implying otherwise.** Nothing here needed it: every test is green
  and no product-bug claim is made.
- Harness viewport defect (1280×720): **not implicated**. No failure I saw was
  layout-, fold- or popover-position-dependent.
- Cleaned up my own `test-results-*`; siblings' left alone.
- Not committed. `PORTED.txt` / `QUEUE.md` / `playwright.config.ts` untouched.

## Summary (3 lines)

Ported 11 tests across 7 describes covering card-backed, native-backed,
custom-label, static-list and field-derived filter value sources; 11/11 and
33/33 under repeat-each=3 on the verified CI jar, tsc clean, zero fixmes.
The queue's `@external` label covers only 2 of the 11 tests — the other 9 need
no container, confirmed by a gate-OFF control (9 executed / 2 skipped).
Eight input mutations killed every test including the archive-modal tail; the one
survivor was my own bad mutation (aimed at data test 2 never reads), killed by a
retargeted mutant rather than written off as vacuity.

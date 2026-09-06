# datamodel-data-studio (QA-database tier)

Port of `e2e/test/scenarios/data-studio/data-model/datamodel-data-studio.cy.spec.ts`
(1541 lines) → `tests/datamodel-data-studio.spec.ts` + `support/datamodel-data-studio.ts`.

## Execution counts (the thing this tier makes easy to fake)

| run | executed | gate-skipped | passed |
|---|---|---|---|
| `PW_QA_DB_ENABLED=1`, quiet container | **33** | **0** | 31 in one run; the 2 stragglers green in an isolated run (see below) |
| gate closed (no `PW_QA_DB_ENABLED`) | 25 | **8** | 25 |

The gate-closed control was run deliberately: 25 pass / 8 skip, which is the
exact split the describes declare. So under the open gate **all 33 tests really
executed against the writable Postgres container** — this is not a
FINDINGS #49 "green run that never ran".

`--repeat-each=2` on the 25 container-free tests: **50/50**.
`bunx tsc --noEmit`: clean (the only errors in the repo are another agent's
`tests/source-replacement.spec.ts`).

No `test.fixme`. No test dropped, weakened or merged.

## The QA-DB tier is not reproducible while sibling agents run

The writable Postgres container (`writable_db`) is **shared by every slot**, and
each spec's `resetTestTable` port only creates its own fixture — upstream's
`multi_schema` (`e2e/support/test_tables.js:208`) does **not** drop foreign
schemas, because CI gets a fresh container per run. Locally the DB accumulated
`Schema A`…`Schema Z` (from the landed `transforms-codegen` / `many_schemas`)
plus six `public` tables (`source_table`, `compatible_target`, `target_*` — the
`source-replacement` spec, which was actively running on another slot).

That pollution deterministically breaks 5 of the 8 QA-DB tests, and the failure
modes look nothing like "extra tables":

- `select/deselect functionality` — checking Domestic + Wild leaves the database
  checkbox **`data-indeterminate="true"`** because `public` is a third schema.
  Reads as a checkbox-propagation bug.
- `mutliple databases … search for tables` — `search "an"` expects 3 tables;
  every `Schema X.Animals` matches, so the count is 28.
- `restore previously selected table` / `indicate published tables` — clicking
  the `Wild` schema times out: it sorts **last** after 26 injected schemas and
  the treegrid does not render it.
- `filter unused tables only` — `Birds` pushed out of the rendered window.

**Measured control**: after dropping the foreign schemas/tables, all five pass
(verified in two runs — 3 of them, then the remaining 2 together in `2 passed
(10.4s)`). Re-polluted mid-run by the sibling, they fail again. Cause and cure
both confirmed; nothing here is port drift and nothing was weakened to
accommodate it.

**Recommendation for the tier**: QA-DB specs need either a per-slot writable
database or a "drop everything not mine" step in the shared reset helpers.
Otherwise this tier's results are a function of what else is running, and a red
run tells you nothing. Worth deciding before more QA-DB specs land.

## Real port lessons (new gotchas)

### 1. Cypress's force-click is a DISPATCH; Playwright's is a real mouse click at coordinates — it can close the thing you are about to test

`H.undoToast().icon("close").click({ force: true })` (in the shared
`Shared.verifyAndCloseToast`) is the standard "dismiss the toast" idiom.
Ported literally with `click({ force: true })`, the real cursor goes to the
toast's coordinates and clicks **whatever is topmost there** — which, when a
modal is open behind the toast, is the modal **overlay**. Measured directly:
the custom-mapping remapping modal detached ~400 ms after opening.

The damage surfaced three steps away and looked like an app bug: the modal's
inputs and Save button reported *"element is not stable"* forever (they were
being unmounted), so the port looked like it needed `force: true` on the modal
too. It did not — `dispatchEvent("click")` on the toast icon (coordinate-free,
which is what Cypress's force-click effectively is) fixed it, and the modal
inputs then take a **plain** click. `support/datamodel-data-studio.ts closeToast`.

Generalises: **`click({ force: true })` is not the port of Cypress's
`{ force: true }`.** Cypress skips actionability *and* aims at the resolved
element; Playwright skips actionability but still aims at a point. Any port
that force-clicks an element floating over other UI has this hazard.

### 2. Mantine `Select` option rows: `{ name, exact: true }` matches NOTHING

`renderOption` puts an `Icon` (`role="img"` + `aria-label`) — and for FK
targets, the column description — inside the `role="option"` row, so the row's
accessible name is *not* the label. Measured on the "Hidden" visibility option:
`getByRole("option", { name: "Hidden", exact: true })` → **0**;
without `exact` → **1**. Upstream's `popover().findByText(label)` /
`.contains(label)` is a substring match anyway, so the substring regex is both
the working and the faithful port. This cost four test failures that all looked
like "the dropdown didn't open" (it did — verified by dumping computed
`display` per dropdown).

### 3. Undo toasts stack → the shared `verifyAndCloseToast` is a latent strict-mode violation

Two consecutive edits (table name → description; sync → rescan) produce a
second toast while the first is still mounted, and
`expect(undoToast(page)).toContainText(...)` in `support/data-model.ts:235`
resolves to 2 elements. Newest is **first** in DOM order, so `.first()` is
correct *and* selects the toast that just appeared.
**Consolidation candidate**: fold `.first()` + `dispatchEvent` into the shared
`Shared.verifyAndCloseToast` — every data-model port will hit both.

### 4. `.blur()` must target the element Cypress typed into, not a re-query

`getFieldNameInput("Tax").clear().type("Analyst Tax Field").blur()` keeps one
Cypress subject. Porting the `.blur()` as
`getFieldNameInput(page, "Analyst Tax Field").blur()` resolves nothing: the
list item's accessible name comes from the **stored** display name and only
updates once the PUT lands — which is the very request the blur is supposed to
trigger. Deadlock. `blurFocused(page)` (`page.locator(":focus").blur()`) is the
faithful port, since `cy.type` targets `document.activeElement`.

### 5. "Table isn't referenced by anything" is registered ASYNCHRONOUSLY after `POST /api/card`

`should filter unused tables only` creates a question on a table and
immediately filters for unused tables. The used table was still listed —
deterministically in the test, but not in a probe that had ~2 s more latency
between the two. Cypress's command queue supplied that latency. Fixed with a
backend readiness gate (poll `GET /api/table?term=&unused-only=true` until the
used table drops out) before driving the UI — the same shape as the
search-index gate rule, applied to the dependency/usage index. Not a weakened
assertion: the UI assertions are unchanged.

## Upstream issues found

- **`Extra info about tables` (3 tests) and `should filter unused tables only`
  restore `postgres-writable` with NO `@external` tag.** On a `-@external` CI
  leg they run against a container that isn't there. Exactly the shape
  data-model-shared-1 flagged for the untagged mysql-8 test — this is now the
  second instance, so it is a pattern rather than a one-off. Gated on
  `PW_QA_DB_ENABLED` here regardless.

## Vacuity / mutation results

Three mutants, all **killed**:

1. Snowplow event name → `zzz_mutation_not_a_real_event` → **fails**. Proves
   `installSnowplowCapture` is really capturing and the matcher discriminates —
   the `data_studio_table_picker_filters_applied` /
   `_search_performed` / `dependency_entity_selected` assertions are live, not
   stubs. (Rule 6's no-op stub would have made two tests assert nothing; all
   three events are `trackSimpleEvent` call sites in
   `frontend/src/metabase/common/data-studio/analytics.ts`, i.e. the
   FE-emitted class the capture covers.)
2. Removed the click-outside before `expect(getFilterForm).toHaveCount(0)` →
   **fails**. The popover-closes assertion is not satisfied by "nothing
   rendered yet" (`openFilterPopover` asserts the popover visible first).
3. `data_layer: "hidden"` → `"final"` on Products (input-only inversion) →
   **fails**. `expectTableNotVisible` is real.

Not mutated, but anchored by construction: `tableHeaderColumn("Tax")`
`toHaveCount(0)` follows a positive `"Analyst Tax"` visible assertion on the
same table; `"Something's gone wrong"` `toHaveCount(0)` follows the
`"Enter an ID"` widget rendering; the `verified_round` absence got an explicit
"the Birds row is visible" anchor added (upstream had none).

**Known gap**: `H.expectNoBadSnowplowEvents` degrades to the documented
structural check — no Iglu schema validation without snowplow-micro.

## Unexplained

Nothing outstanding. The one thing I did **not** establish is whether the
`should allow clearing the field description` preview values
(`39.72, 117.03, …`) survive a CI-built jar — they are upstream's pinned
sample-data numbers and pass on the local 2026-07-18 jar, but that is exactly
the class FINDINGS #43 warns drifts between jars.

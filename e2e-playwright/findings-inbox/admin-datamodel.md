# admin-datamodel (slot 4, port 4104)

Source: `e2e/test/scenarios/admin/datamodel/datamodel.cy.spec.ts` (1362 lines)
Target: `e2e-playwright/tests/admin-datamodel.spec.ts` (34 tests)
New support module: `support/admin-datamodel.ts`

All runs: local jar `target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`,
`PW_SLOT_OFFSET=4`, `--workers=1`.

## Summary (3 lines)

34 tests ported 1:1; 29 pass, 5 skip. Six mutants raised, **six killed**, three
of them at *tail* assertions — no vacuous greens found.
The one real problem is environmental: the shared `writable_db` container is
carrying 26 `Schema A`…`Schema Z` from a `many_schemas` spec, and because the
admin table picker is **virtualized** that pushes `Wild` out of the DOM entirely,
which cannot be fixed from inside a port.
**Honest caveat: the gate-off differential is only 1 test** — 4 of the 5 QA-DB
tests are blocked by that contamination and did not execute here.

## Executed vs gate-skipped, with the gate-OFF control

| Run | passed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` (run 2, final) | **29** | 5 |
| gate OFF (control) | **28** | 6 |
| `PW_QA_DB_ENABLED=1 --repeat-each=2` | **58** | 10 |

Skips, itemised (gate ON):
- 1 × `question with joins (metabase#15947-2)` — tagged `@skip` **upstream**, so
  it never runs in Cypress either. Body ported verbatim under `test.skip`.
- 4 × QA-DB `@external` picker tests — skipped by an explicit *clean-container*
  precondition (see below), **not** by the QA-DB gate.

So the QA-DB gate accounts for a delta of exactly **one** test
(`Preview section > Empty states > should show empty state when there is no
data`). That is a weak differential and I am flagging it rather than dressing it
up: this is the FINDINGS #49 shape, and the reason is the contamination below,
not the gate.

**Container evidence that the QA-DB path really executed** (read after the
gate-ON runs, `writable_db` on :5404):

```
"Domestic"."Animals" => 0     <- the Empty-states beforeEach DELETE landed
"Wild"."Animals"     => 3     <- recreated by resetTestTableMultiSchema
"Wild"."Birds"       => 1
debris schemas       => 26    <- untouched; I dropped nothing
```

## 🔴 FINDINGS #85, measured — the mechanism is the VIRTUALIZED table picker

This is my domain's instance of the shared-container problem, and I can now name
the mechanism precisely rather than describing symptoms.

`TablePicker/components/Results.tsx` uses `@tanstack/react-virtual`
(`VIRTUAL_OVERSCAN = 5`, `ITEM_MIN_HEIGHT = 32`). It renders only the rows in
the scroll window. Measured on slot 4 at the default 1280×800 viewport:

```
API  GET /api/database/<writable>/schemas  -> 29 schemas
     ["Domestic","Schema A"…"Schema Z","Wild","public"]
DOM  rendered tree-item[data-type=schema]  -> 20
     ["Domestic","public","Schema A" … "Schema R"]
scroll container: scrollHeight 1016 / clientHeight 517
```

`Wild` sorts after `Schema Z`, so **it is never in the DOM**. Every failure in
run 1 traces to this one fact:

| Failing test | Fingerprint |
|---|---|
| picker `should restore previously selected table when expanding the tree (SEM-435)` @external | `click` timeout on `getSchema("Wild")` |
| visibility `…single-schema database (multi-schema database)` @external | same |
| visibility `should update the table picker state when toggling…` @external | same |
| picker `should allow to search for tables` @external | `getDatabases()` → **0** after clearing the search — the virtualizer scrolled to the selected `Birds` row at the bottom, unmounting the *database* rows too |

**Proof the port is correct, not drifted.** I copied the three non-count-based
tests verbatim into a scratch spec whose only change was
`test.use({ viewport: { width: 1280, height: 1800 } })` — enough rows in the
window to reach `Wild`. **3/3 passed in 8.4s**, no other edit. The port logic is
sound; only the render window was wrong.

The fourth (`should allow to search for tables`) is *inherently* fatal under
contamination: it asserts `getSchemas()).toHaveCount(2)` after clearing the
search, and 29 schemas are 29 schemas at any viewport.

**Why the misdiagnosis warning in the brief is right.** From one side this reads
as a product bug ("the picker won't render my schema"); from the other as port
drift ("your locator is wrong"). It is neither. Upstream's reset
(`e2e/support/test_tables.js multi_schema`, and `many_schemas` too) only ever
does `createSchemaIfNotExists` + per-table drop/create — **neither drops foreign
schemas**, and `writable_db` is shared by all five slots.

**What I did about it.** `requireCleanWritableSchemas()` in
`support/admin-datamodel.ts` queries `pg_namespace` read-only and `test.skip`s
the four affected tests with the offending schema list in the message. It drops
nothing (sibling QA-DB agents are live) and turns green automatically once the
container is clean. This makes an assumption upstream leaves implicit — "the
writable DB holds only the schemas `multi_schema` created" — explicit, rather
than leaving four permanently-red tests that are neither the port's fault nor
the app's.

**Durable fix (needs a decision above my scope):** either have the
`multi_schema` reset drop schemas it does not own before recreating (that means
editing the shared `support/data-model.ts`, which I did not touch), or give the
writable container a teardown between sessions. Recommending the former.

**Note for CI:** the Playwright leg runs `-@external`, so none of these five
execute in CI today. They are correct-by-construction plus the tall-viewport
measurement above, not CI-verified.

## Mutation testing — 6 raised, 6 killed

Every mutant inverts the **input**, never the expectation.

| # | Mutation | Result | Died at |
|---|---|---|---|
| M1 | `hidden table should not show up…`: remove the "Hide table" click | **killed** | 1st absence assertion (admin browse) |
| M1b | M1 + neutralise the two earlier absence assertions | **killed** | **tail** — `miniPicker …getByText(/Orders/)).toHaveCount(0)` |
| M2 | Responsiveness: remove `setViewportSize({800,800})` | **killed** | 1st `not.toHaveText("Sync options")` |
| M2b | M2 + neutralise all label assertions | **killed** | **tail** — first tooltip `toBeVisible()` |
| M3 | FK-target test: grant data-model perms on `REVIEWS_ID` too | **killed** | the `"Reviews → ID"` **absence** assertion (`toHaveCount(0)` → 1) |
| M4 | inaccessible-FK test: grant perms on all four tables | **killed** | `toHaveAttribute("data-combobox-disabled","true")` → `null` |
| M5 | sorting-alphabetically: click "Auto order" + neutralise the radio assertion | **killed** | **tail** — `assertTableData` col 0 `"Category"` vs `"ID"` |
| M6 | clear-description: never clear it + neutralise toast/value assertions | **killed** | **tail** — `hovercard).not.toContainText("The total billed amount.")` |

Two results worth keeping:

- **M3 settles the absence question that PORTING #73 warns about.** I had added
  an anchor (assert `"Products → ID"` is visible *before* asserting
  `"Reviews → ID"` is absent) on the theory the bare port could be satisfied by
  "the popover hasn't rendered". M3 shows the assertion is genuinely
  load-bearing: with Reviews granted, the option appears and the check goes red
  at exactly that line. The anchor is justified, not decorative.
- **M6 proves the hovercard tail isn't vacuous.** `hoverPreviewHeaderCell`
  asserts the hovercard is visible before the `not.toContainText`, so a
  never-opened hovercard cannot produce a silent pass — and M6 confirms it
  empirically (`"The total billed amount.No special typeAverageMinMax…"`).

Not mutated, with the reason stated: the `not.toBeFocused()` chain in
`should not auto-focus inputs in filtering preview` has no clean input
inversion, but each assertion is preceded by `toBeVisible()` on the same
locator, so it cannot pass on a locator that matches nothing.

## Fixmes

**None.** No `test.fixme` in the file. The only skips are the upstream `@skip`
test and the container precondition, both documented in-file.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` is clean for this spec and
`support/admin-datamodel.ts`. (One unrelated pre-existing error in a sibling
agent's `tests/entity-picker.spec.ts` — `clickPickerItem` not exported from
`support/entity-picker` — was present before I started and is not mine.)

## Port decisions worth reviewing

- **Duplicate test title.** Upstream has two `it`s inside `Table visibility`
  with the identical title `"should allow hiding and restoring all tables in a
  single-schema database"`; the second is `@external` and is actually about a
  *multi*-schema database. Duplicate titles are a hard load error in Playwright,
  so the second is suffixed `(multi-schema database)`. Upstream's title looks
  like a copy-paste slip worth fixing there.
- **`resyncDatabase` given explicit `tables`.** All my QA-DB call sites pass
  `tables: ["Animals", "Birds"]`. The bare `{ dbId }` form would return before
  the tables `resetTestTableMultiSchema` just created had synced.
  Not re-derived — taken from the brief.
- **`@schema` wait dropped in SEM-484.** Upstream's `cy.wait("@schema")` after
  clicking the Segments link is satisfied *retroactively* by the
  `GET /api/database/:id/schema/:schema` fired during the preceding visit (the
  beforeEach alias is distinct from `visit()`'s own `datamodel/visit/schema`).
  `waitForResponse` does not consume past responses, so porting it literally
  would hang. Dropped, with the retrying assertions carrying the load.
- **Toast helpers.** Used `verifyAndCloseToastFirst` / `closeToast` from
  `support/datamodel-data-studio.ts` (`.first()` + `dispatchEvent("click")`)
  rather than the shared `data-model.ts verifyAndCloseToast`, which still does
  `click({ force: true })` — the flagged real-mouse hazard.
  **Consolidation candidate:** fold `.first()` + `dispatchEvent` into the shared
  helper and delete the local variant.
- **Snowplow.** The `Field section` describe only calls
  `resetSnowplow`/`enableTracking`/`expectNoBadSnowplowEvents` — snowplow is
  incidental, so rule 6 would permit a pure no-op. I used
  `installSnowplowCapture` instead so `expectNoBadSnowplowEvents` keeps its
  structural form. It still cannot catch Iglu schema-validation failures; those
  tests are not snowplow coverage.
- **`popover({ skipVisibilityCheck: true }).should("not.be.visible")`** ported as
  "no *visible* popover" (`toHaveCount(0)` on the already-visibility-filtered
  shared `popover()`). Slightly weaker than Cypress, which also requires the
  node to exist; noted rather than worked around.

## Reuse — almost no new support code

`support/admin-datamodel.ts` is 190 lines and holds only what had no home:
`getSyncOptionsButton`, `getSortDoneButton`, `tablePicker`, four
`waitFor*` predicates, the `tableRowButton` / `verifyTables*` /
`verifyToastAndUndo` / `turnTableVisibilityOff` / `setDataModelPermissions`
spec-locals, and `foreignWritableSchemas`. Everything else is imported
read-only from `data-model.ts`, `datamodel-data-studio.ts`,
`data-studio-tables.ts` (`fieldSectionNameInput` — `FieldSection` in
`data-model.ts` lacks `getNameInput`, and I did not edit the shared module),
`dashboard-repros.ts`, `permissions.ts`, `notebook.ts`, `ad-hoc-question.ts`,
`ui.ts`, `charts.ts`, `command-palette.ts`, `documents.ts`, `factories.ts`,
`metrics.ts`, `multiple-column-breakouts.ts`, `schema-viewer.ts`,
`search-snowplow.ts`.

**Note:** `support/INDEX.md` has no `datamodel-data-studio.ts` section (that
module landed after the last index regeneration), so it cannot be found by
reading the index alone. I did not regenerate the index (instructed not to run
`build-helper-index.mjs`).

## Unexplained

Nothing. Every failure observed in run 1 traces to the virtualized-picker
mechanism above, and that mechanism was measured directly (API schema list vs
rendered DOM list vs scroll geometry), not inferred.

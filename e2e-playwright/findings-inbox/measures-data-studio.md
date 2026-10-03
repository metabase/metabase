# measures-data-studio.spec.ts — findings

Source: `e2e/test/scenarios/data-studio/measures/measures-data-studio.cy.spec.ts` (569 lines, 14 tests)
Target: `e2e-playwright/tests/measures-data-studio.spec.ts` + `e2e-playwright/support/measures-data-studio.ts`

Result: **14/14 passing on the CI uberjar** (COMMIT-ID `751c2a98`, verified via
`/api/session/properties` → `version.hash 751c2a9` + hashed static assets, so it
really was jar mode despite the "(reused)" backend line). Stable at 28/28 under
`--repeat-each=2`. `bunx tsc --noEmit` clean. 0 skips, 0 fixmes.

## Fixes needed while stabilizing

**None.** The port was green on the first jar run. No product-bug claim is made
here and none was investigated — nothing failed.

The reason it went clean is that this spec is a near-structural twin of
`segments-data-studio.cy.spec.ts`, which landed earlier, so every gotcha it
could have hit (EditableText name edits via click+End+pressSequentially, toast
`.first()`, `findByDisplayValue` via the imperative scan, `expect.poll` on URL
assertions, snowplow stubs, `waitForResponse` registered before the trigger) was
already encoded in that port and applied up front. Worth noting as evidence for
the "port the domain's helper surface first, then fan out" batch rule.

## Vacuous upstream assertion found (dividend)

`Measure deletion › should remove measure via more menu` (upstream lines
252-253) ends with:

```js
cy.log("verify measure removed from query builder");
verifyMeasureNotInQueryBuilder("Total Revenue");
```

The test creates a measure named **"Measure to Delete"** and never creates
"Total Revenue" (`H.restore()` runs in `beforeEach`, so nothing from the earlier
creation test survives). The assertion therefore asserts the absence of
something that never existed — it can never fail, and the actual deletion is
never verified in the query builder.

Ported as the **real** assertion: `verifyMeasureNotInQueryBuilder(page,
"Measure to Delete")`. It passes on the jar, so the underlying behaviour is
correct — the upstream check was simply testing nothing. Cheap upstream fix:
change the argument in the Cypress spec.

## Porting gotchas worth adding to PORTING.md

Nothing new. Everything applicable was already documented. One small
reinforcement, if the maintainers want it recorded:

- **`.type(" X{enter}")` on a detail-page name field ports to click → `End` →
  `pressSequentially` → `Enter`**, not `fill()`. Already covered by the wave-5
  EditableText note and the wave-12 "`.type()` focuses the caret at position 0"
  note; this spec is a second confirming instance (measure rename fires
  `PUT /api/measure/:id` and the "Measure name updated" toast only on the real
  keystroke path). By contrast `fill()` is fine on the *new*-measure page name
  input, which is a plain controlled input, not EditableText.

## Consolidation debt spotted

- **Two `MeasureEditor` helper objects now exist.** `support/measures-queries.ts`
  carries a small one targeting the **library** route
  (`/data-studio/library/tables/:id/measures/new`, only get/name/aggregation/save);
  `support/measures-data-studio.ts` (new, this port) carries the fuller
  **data-model** surface (description, actions menu, breadcrumb, the three pane
  tabs, list + revision-history locators). Both are faithful ports of the *same*
  `H.DataModel.MeasureEditor` in `e2e-datamodel-helpers.ts` — Cypress has one, we
  have two. Consolidation target: one `support/measures.ts` exporting
  `MeasureList` / `MeasureEditor` / `MeasureRevisionHistory` + `createMeasure` /
  `updateMeasure` + both `visitNewMeasurePage` (library) and
  `visitDataStudioMeasures` (data-model). Not done here — parallel agents, shared
  files off-limits (PORTING rule 9). Consolidating toward the single Cypress
  shape satisfies the "only consolidate toward a shape Cypress already has" rule.
- **The snowplow no-op stub block is now copy-pasted in a 4th module**
  (`measures-data-studio.ts`, joining `homepage.ts`, `datamodel-segments.ts`,
  `segments-data-studio.ts`). Already on the consolidation list in PORTING.md —
  this is just another data point for hoisting it to one module.
- `undoToast` (metrics.ts) vs `expectUndoToast` (measures-queries.ts) vs
  `undoToastList` (organization.ts) — three spellings of the same
  `getByTestId("toast-undo")` assertion. Already flagged; this port used
  `undoToast(page).first()`.
- The `_measures_reexports` WIP scaffolding in `support/measures-queries.ts`
  was left untouched per the brief. (It is not actually present in the current
  file contents — the module has no such export today, so that PORTING.md
  consolidation entry may already be stale.)

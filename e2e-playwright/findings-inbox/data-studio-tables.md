# data-studio-tables

Port of `e2e/test/scenarios/data-studio/data-studio-tables.cy.spec.ts`
(176 lines, 10 tests) → `tests/data-studio-tables.spec.ts`.

**Result: 10/10 executed and green on the CI uberjar (`target/uberjar/metabase.jar`,
COMMIT-ID 751c2a98) on slot 4 (:4104), 20/20 under `--repeat-each=2`. `tsc --noEmit`
clean. Zero fixmes, zero gate-skips at runtime.**

## Dividends: none

Every upstream assertion in this spec is a real assertion. Nothing was found
vacuous, no product-bug candidate surfaced, and the port needed no fixes beyond
the standard mechanical rules (EditableText keystrokes, `cy.icon` ANY-match,
`invoke("removeAttr","target")`). It went green on the first run.

## Two faithfulness details worth recording

1. **`allTableItems().should("have.length", 0)` carries an implicit page
   assertion in Cypress that a naive Playwright port drops.** Upstream's
   `allTableItems()` is `cy.findByTestId("library-page").findAllByTestId("table-name")`
   — the outer `findByTestId` *fails* if the library page isn't rendered. The
   direct Playwright equivalent (`libraryPage(page).getByTestId("table-name")`
   + `toHaveCount(0)`) resolves to 0 on *any* route, so the unpublish test would
   pass vacuously if the app navigated somewhere else. Added an explicit
   `expect(libraryPage(page)).toBeVisible()` ahead of the count.
   Generalisable: **`cy.findByTestId(scope).findAll…().should("have.length", 0)`
   is two assertions; ported to `scope.locator(...).toHaveCount(0)` it becomes
   one.** Worth a sweep of existing ports for this shape.

2. **The `should("not.exist")` pair in "close field details and preview panels"
   is NOT vacuous — control-checked, not assumed.** Upstream closes the panels
   and asserts absence, with nothing asserting they were open first. I gated it
   on `expect(FieldSection.get).toBeVisible()` + `expect(PreviewSection.get).toBeVisible()`
   immediately after the Preview click; both pass, so the preview really does
   render and the subsequent absence checks are meaningful. Recorded as a
   strengthening, **not** as a dividend — the original was sound, just
   under-specified.

## Helper surface

New module `support/data-studio-tables.ts` — the `H.DataStudio.Tables.*`
members that `support/data-studio-library.ts` doesn't already carry, plus the
two `H.DataModel.FieldSection` members missing from `support/data-model.ts`
(`getNameInput`, `getCloseButton`). Reused read-only, per the brief:
`tableHeader` / `libraryPage` / `tableItem` / `visitLibrary` /
`dataStudioBreadcrumbs` (data-studio-library.ts), `TableSection` /
`FieldSection` / `PreviewSection` (data-model.ts), `DependencyGraph` /
`waitForBackfillComplete` (dependency-graph.ts), `tableHeaderColumn`
(notebook.ts), `queryVisualizationRoot` (rows.ts), `undoToastList`
(organization.ts), `undoToast` (metrics.ts), `icon`/`modal`/`popover`/
`queryBuilderHeader` (ui.ts). No shared module edited. No new `dataStudioNav`
or `codeMirrorHelpers` copy (neither was needed here).

### Consolidation candidates surfaced
- **`FieldSection.getNameInput` / `getCloseButton` belong in
  `support/data-model.ts`** next to the rest of the ported `FieldSection`
  object — Cypress has exactly one copy (`e2e-datamodel-helpers.ts`), so
  folding them in stays faithful. They live in `data-studio-tables.ts` only
  because shared modules are off-limits to parallel agents.
- **`replaceEditableText`** here is `data-model.ts replaceValue` plus the
  `blur()` step every caller does anyway. One helper, not two.
- **`undoToast` (metrics.ts) ≡ `undoToastList` (organization.ts)** — this spec
  imports *both*, from two modules, for the same `getByTestId("toast-undo")`
  locator, purely because upstream happens to call `H.undoToast()` in one test
  and `H.undoToastList()` in another. Already on PORTING's consolidation list;
  this is a third independent sighting.

## Gating

No gate-skips executed. The describe is guarded by
`test.skip(!resolveToken("pro-self-hosted"))` (rule 7 — the library is a real
EE token feature and `H.activateToken` is in the upstream `beforeEach`), and
the token is present locally, so all 10 tests genuinely ran. Nothing here was
gated "by reflex": there is no `@OSS` tag and no external/QA-DB dependency.

## Not verified

- Only checked against the local jar (751c2a98) on one slot; no Cypress
  cross-check was run, because nothing failed and the cross-check only
  establishes fidelity for failures.
- No date/timezone-sensitive assertions in this spec (the sidebar's "Last
  edited at" is asserted by *label*, not value), so the `TZ=US/Pacific` risk
  class doesn't apply — runs were done with it set regardless.

# temporal-unit-parameters

Source: `dashboard-filters/temporal-unit-parameters.cy.spec.js` (1227 lines, no gating tags)
Port: `tests/temporal-unit-parameters.spec.ts` + new helpers `support/temporal-unit-parameters.ts`

Result: 26/26 tests green on the jar (slot 2), 52/52 under `--repeat-each=2`, tsc clean.
No test.fixme, no product-bug claims — so no Cypress cross-check needed.

## Fixes classified

All fixes were **known gotchas** the brief already warned about; no new gotchas.

1. **`H.selectDashboardFilter` is `.contains` (case-sensitive SUBSTRING), not
   exact.** The shared `dashboard-parameters.ts` port of `selectDashboardFilter`
   uses `getByText(name, { exact: true })`. That works in its own spec (mapping
   row is a bare "Created At") but broke on 5 tests here: the temporal-unit
   mapping row reads **"Created At: Month"** (the breakout unit is shown), so
   exact matched nothing and the click timed out. The real helper
   (`e2e-dashboard-helpers.ts`) is `popover().contains(filterName).click({force})`.
   Ported faithfully as a local `selectDashboardFilter` using a substring regex +
   `.first()`. This is the documented "Rule 1 is about `findByText`, not
   `cy.contains`" gotcha.
   - CONSOLIDATION FLAG: the shared `dashboard-parameters.ts selectDashboardFilter`
     is arguably wrong (exact where upstream is substring). It happens to pass in
     its home spec but is a latent trap for any importer whose mapping label
     carries a suffix. Worth reconciling the two in a consolidation pass —
     upstream `H.selectDashboardFilter` is unambiguously substring.

2. **`findByLabelText("Month")` checkbox rows → click the exact label TEXT, not
   `getByLabel`.** The temporal-unit selection popover checkboxes have accessible
   names like `"check icon Month"` (an icon contributes sr text), so
   `getByLabel("Month")` is a substring match that hit 3 rows (Month / Day of
   month / Month of year) and `{exact:true}` would hit 0 (the "check icon"
   prefix). testing-library `findByLabelText` matches the label's text content
   ("Month"). Ported as `popover().getByText("Month", { exact: true }).click()`,
   which toggles the checkbox via its label. (2 parameter-settings tests.)

## Port adaptations (faithful, not fixes)

- **URL click-behavior test** (`custom destination -> url`): upstream hardcodes
  `http://localhost:4000/dashboard/...` (its baseUrl). The port builds the url
  from `mb.baseUrl` so the click stays on the slot backend instead of navigating
  to :4000 — the same class as the documented site-url re-point.
- **Overlapping dashcards**: `createDashboardWithQuestions` places every dashcard
  at row 0/col 0 (faithful to the Cypress helper); the grid stacks them
  vertically. Ported `should("exist")` → `toBeAttached` (a stacked card can be
  below the fold) and `should("be.visible")` → `toBeVisible`.
- **Native-aware `createDashboardWithQuestions`**: the `dashboard-parameters.ts`
  port only creates structured questions; this spec mixes native cards (SQL
  units/time) into the same dashboard, so the new module has a native-detecting
  variant (mirrors the real helper's `isNative` branch).
- Only one explicit intercept wait was kept (`@queryMetadata`, test 1, registered
  before the triggering `addQuestion`); the post-save `@cardQuery` waits are
  covered by `saveDashboard`'s dashcard-load settle plus the retrying
  `ensureDashboardCardHasText` assertions.

## New helpers (all in support/temporal-unit-parameters.ts)

Question/parameter fixtures; spec-local UI helpers (addQuestion, removeQuestion,
editParameter, backToDashboard, addTemporalUnitParameter, selectDashboardFilter);
createDashboardWithQuestions (native-aware) / createDashboardWithMappedQuestion /
createDashboardWithMultiSeriesCard; ensureDashboardCardHasText (targets the
`dashcard` testid, distinct from `dashcard-container`); resetFilterWidgetToDefault
(revert icon, hover-gated); dashcardTableHeaderColumn.

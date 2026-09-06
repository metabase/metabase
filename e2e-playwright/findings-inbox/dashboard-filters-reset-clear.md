# dashboard-filters-reset-clear

Port of `e2e/test/scenarios/dashboard-filters/dashboard-filters-reset-clear.cy.spec.ts`
(1274 lines) → `tests/dashboard-filters-reset-clear.spec.ts`, helpers in
`support/dashboard-filters-reset-clear.ts`. 17 tests, all green on the jar
(slot 1), 34/34 under `--repeat-each=2`. No product bugs; every fix below is
port-fidelity/harness, so no `test.fixme` and no Cypress cross-check needed.

## Fixes classified (all "known/new gotcha", none migration dividends)

1. **`typeCypress` caret must start at END of existing text (new-ish gotcha).**
   Cypress `.type()` focuses with the caret after any pre-filled text;
   Playwright `press`/`pressSequentially` focus with the caret at position 0.
   A leading `{backspace}` over a pre-filled single-value input
   (id/number single update: existing "1" + `"{backspace}2"`) produced **"21"**
   instead of "2" — the backspace hit an empty position and "2" was prepended.
   Fix: `await locator.press("End")` at the start of `typeCypress` before
   interpreting the `{backspace}`/`{selectAll}` tokens. No-op on empty inputs,
   so the multi-token comboboxes (which delete chips via backspace-on-empty)
   are unaffected. This is the general rule for porting any Cypress `.type()`
   that mixes `{backspace}` with pre-existing field content.

2. **`auto_apply_filters:false` is dropped by POST + the shared
   `createDashboardWithTabs` PUT (instance of the "create* helpers aren't thin
   wrappers" gotcha).** `POST /api/dashboard` ignores `auto_apply_filters`
   (defaults true) and `support/dashboard-core.ts createDashboardWithTabs`
   does `PUT {...dashboardFromPost, dashcards, tabs}` — spreading the response's
   `true` back over the intended `false`. Symptom was evil: the "off" cross-tab
   tests failed at `applyFilterButton().click()` timing out **because the Apply
   toast never appeared** — the filter had auto-applied (card already showed the
   filtered rows), so there was nothing pending to apply. Fix: the port's
   `createDashboardWithParameterInEachTab` issues a dedicated follow-up
   `PUT { auto_apply_filters }` after `createDashboardWithTabs`. (Did not edit
   the shared helper.)

3. **Debounced "Search the list" needs a settle-wait before a singular click
   (known: async-filtered list gotcha).** Location-single `setDefaultValue`
   ports `cy.findByRole("listitem").click()` — singular, so Cypress retries
   until the search debounce narrows 1000 cities to one. Playwright's
   `getByRole("listitem").click()` hit strict-mode with 1000 matches. Fix:
   `await expect(pop.getByRole("listitem")).toHaveCount(1)` before the click.

4. **`blur()` re-renders the full option list (text single).** Upstream
   `findByRole("textbox").type(v).blur(); findByRole("listitem").eq(0).click()`
   relies on the list staying filtered to the typed category, so `eq(0)` = the
   match. In Playwright the blur re-showed the full list before the click, so
   `eq(0)` = "Doohickey" (alphabetical first). Fix: click the option **by its
   text** (`listItemContaining(pop, plainValue)`, tokens stripped) — the same
   option `eq(0)` resolves to once filtered.

5. **Multi-select options are `checkbox`-in-`listitem`; the `<li>` isn't the
   toggle (known: click the deepest node).** Text-multiple ported
   `findAllByRole("listitem").contains(v).click()` as a click on the `<li>`,
   which didn't toggle the checkbox, so "Add filter" stayed disabled. Cypress
   `.contains().click()` clicks the innermost text node (which toggles via the
   checkbox). Fix: `pop.getByRole("checkbox", { name: item, exact: true })`.
   (Location-multiple's default-value editor already used
   `getByRole("checkbox")` and passed — same widget family.)

## Notes / helper surface
- New module `support/dashboard-filters-reset-clear.ts` holds the flow
  functions (checkDashboardParameters, checkParameterSidebarDefaultValue, the
  two cross-tab checks, the status-icon/date/range helpers, `typeCypress`,
  `filter`, `fieldValuesTextbox`, `listItemContaining`). Cypress `(label,value)`
  callbacks became `(page, label, value)`.
- Reused: dashboardParametersPopover (dashboard-core), fieldValuesCombobox
  (native-filters), dashboardParameterSidebar/applyFilterButton/
  createQuestionAndDashboard (dashboard-parameters), getDashboardCard/
  editDashboard/filterWidget (dashboard), popover/icon/visitDashboard (ui),
  updateDashboardCards/createDashboardWithTabs (dashboard-core).
- Consolidation candidate: `fieldValuesTextbox` (findByRole textbox) is a tiny
  generic that other specs may want alongside native-filters' `fieldValuesCombobox`.

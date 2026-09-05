# text-cards.spec.ts (from dashboard/text-cards.cy.spec.js)

Ported faithfully — 8 tests, 8/8 green on the jar (slot 2), 16/16 under
`--repeat-each=2`. tsc clean. No `test.fixme`, no product bugs, no
Cypress-masked issues surfaced. No cross-check needed (nothing was claimed).

## Fixes classified (all "known gotcha", none new)

- **Snowplow stub** (rule 6): the spec carries the snowplow tag —
  `resetSnowplow`/`enableTracking`/`expectNoBadSnowplowEvents`/
  `expectUnstructuredSnowplowEvent` are no-op stubs; real UI actions kept.
- **Markdown text cards render markdown** (brief rule): `Text *text* __text__`
  asserted via `getByText("Text text text")` on the rendered `<p>`, not
  `toHaveValue`. Placeholder text (`{{like_this}}` / `{{variables}}`) renders
  literally and is asserted exact.
- **`parseSpecialCharSequences: false`** is a no-op for `fill()` — Playwright
  types the literal `{{foo}}` with no escape parsing (new helper
  `addTextBoxWhileEditing` in support/text-cards.ts documents this).
- **`.get("h2")`/`.get("input")`/`.get(".text-card-markdown")`** (Cypress
  re-queries from root) ported scoped to the dashcard — only one text/heading
  card exists at a time.

## One reusable observation (candidate for PORTING.md gotchas)

The text card's **"Show visualization options" opens a Mantine `<Modal>`**
(`ChartSettingsButton` → `metabase/ui` Modal), which overlays the dashcard.
The Cypress `realHover()` before the immediately-following "Visualize another
way" not-exist check just parks the OS cursor and never errors; a Playwright
`.hover()` onto the now-covered card would be intercepted ("subtree intercepts
pointer events"). Because the assertion is a not-exist (the label never renders
for text cards regardless), the fix is to drop the hover for that one check.
The post-Cancel Edit/Preview not-exist checks keep the hover (modal closed).
Same family as the wave-10 "Playwright refuses to click a descendant of an
`aria-disabled`/covered ancestor" note — a modal-covered hover, not a click.

## Helpers

- New: `addTextBoxWhileEditing` (support/text-cards.ts) — the only shape the
  consolidated modules didn't have (`addTextBox` enters edit mode first;
  `addHeadingWhileEditing` already existed in dashboard-parameters.ts).
- Imported read-only: editDashboard/saveDashboard/getDashboardCard/setFilter/
  selectDashboardFilter/filterWidget/editBar (dashboard.ts),
  dashboardParametersPopover (dashboard-core.ts), addTextBox
  (dashboard-management.ts), showDashboardCardActions (dashboard-cards.ts),
  addHeadingWhileEditing/dashboardParametersContainer/
  editingDashboardParametersContainer/mockParameter (dashboard-parameters.ts),
  createDashboard/createQuestionAndDashboard (factories.ts),
  fieldValuesCombobox (native-filters.ts), popover/visitDashboard (ui.ts).
- `metabase-types/api/mocks` is not importable in e2e-playwright — used the
  local `mockParameter` port instead of `createMockParameter`.

# waterfall.cy.spec.js → tests/waterfall.spec.ts

18 tests ported (all describes), verified on the jar (slot 5, COMMIT-ID
751c2a98): 18/18 green, 36/36 under `--repeat-each=2`. tsc clean.

New helpers: `support/waterfall.ts` only
(verifyWaterfallRendering / switchToWaterfallDisplay / getWaterfallDataLabels /
assertEChartsTooltipNotContain / countDisplayValue). Everything else imported
read-only.

## Fixes classified

- **Duplicate test title (upstream typo, mechanical).** The two multi-series
  tests share the exact title "should correctly switch into single-series mode
  for ad-hoc queries" upstream (copy-paste — the second is the saved-question
  path). Playwright *errors* on duplicate titles, so the saved variant was
  retitled "…for saved queries" (comment records why). Preserves the issue
  number (#15152). Not a known gotcha — worth a one-liner in the brief:
  **Playwright forbids duplicate test titles; disambiguate faithfully.**

- **Known gotcha (rule 3): `should("be.visible")` on chart paths is any-of-set.**
  `H.chartPathWithFillColor("#88BF4D").should("be.visible")` → the increase
  color matches several bar paths → `.filter({ visible: true }).first()`.

- **Known gotcha (rule 3, new instance): goal line is a zero-height path.**
  `H.goalLine().should("exist")` — the goal line is `<path d="M83 204L824 204">`
  (a horizontal line, zero-area box). Playwright's `toBeVisible` calls a
  zero-area box hidden, so ported existence as `toBeAttached()`, not
  `toBeVisible()`. Same class as the zero-extent single-point line path in rule
  3, but here surfaced on a *goal line* rather than a series.

- **Un-ported `H` helper: `assertEChartsTooltipNotContain`.** Added to
  waterfall.ts (consolidation candidate — belongs next to assertEChartsTooltip
  in viz-charts-repros.ts).

- **`getByDisplayValue` is absent from this install's Playwright types**
  (playwright-core 1.61.1 d.ts has no `getByDisplayValue` on Page *or* Locator,
  even though the runtime ships it). Ported `cy.findByDisplayValue` scoped via
  an imperative `input/textarea/select` + `inputValue()` scan
  (`countDisplayValue` for the retried exist/not-exist poll;
  filters-repros.`findByDisplayValue` for the click targets). Worth noting in
  the brief so agents don't reach for `getByDisplayValue`.

## Port-drift I made and corrected (not app bugs)

- **`cy.findByText("Filter")` after summarize is unscoped and ambiguous.**
  Post-summarize the notebook renders a Filter action on *both* the data and
  summarize steps (two `.Icon-filter`), so the shared `filterNotebook`
  (unscoped `action-buttons .Icon-filter`) hit a strict-mode violation. First
  scoped to the **data** step — wrong: the expression `[Created At: Month]`
  references the post-aggregation breakout column, so a first-stage filter
  reported "Unknown column: Created At: Month" and left Done disabled. Correct
  scope is the **summarize** step (`getNotebookStep(page, "summarize")`). The
  editor text was byte-correct throughout — the failure was *which stage's
  column scope* the filter used, invisible until screenshotted. Cross-check note
  for the brief: when a valid-looking custom expression leaves Done disabled,
  suspect column *scope* (stage), not typing mechanics.

## No product bugs / fixmes.

Mapping choices worth reusing:
- `cy.contains("Visualization")` / `cy.findByText("Visualization")` (open the
  chart-type picker) → `openVizTypeSidebar` (getByTestId("viz-type-button")).
- native ad-hoc runs via `runNativeQuery` (the play-icon click + /api/dataset
  wait) since visitQuestionAdhoc doesn't autorun native.
- `.trigger("mousemove")` → `triggerMousemove` (synthetic dispatch);
  `.realHover()` → `hover()` — bar/segment hovers fire tooltips without force.

# offset.spec.ts (question/offset.cy.spec.ts)

Ported clean — no product bugs, no fixmes. 7 active tests pass, 2 upstream
`{ tags: "@skip" }` tests ported faithfully as `test.skip`. Green on the jar
(slot 2, COMMIT-ID 751c2a98): 7/7, and 14/14 under `--repeat-each=2`. tsc clean.

## Fixes classified

All mechanical, no new gotchas:

- `cy.button(name)` → `getByRole("button", { name, exact: true })` (cy.button is
  `findByRole("button", { name })`, exact).
- `cy.intercept("POST","/api/card").as("saveQuestion")` + `cy.wait` collapsed
  into `saveQuestion` (support/offset.ts): waitForResponse registered before the
  modal Save click (rule 2). The bare Save→modal-Save on a fresh ad-hoc
  question did NOT trip the "modal defaults to a dashboard" gotcha — there's no
  dashboard context, so it files into a collection and returns the card id.
- Expression editor is CodeMirror → shared `enterCustomColumnDetails`
  (notebook.ts, native keyboard). `cy.realPress("Tab")` → `keyboard.press("Tab")`.
- ECharts axis/title text matched as case-sensitive substring (`.first()`) not
  exact getByText — the standard wave-11 leading/trailing-space precaution.
- Field/aggregation/breakout refs kept as plain object literals (query is
  `Record<string, unknown>` this side); metabase-types annotations dropped,
  behaviour unchanged.

## Consolidation candidates surfaced

None new. Reused create* (factories), openTable (ad-hoc-question),
summarizeNotebook/addSummaryGroupingField (joins), notebook.ts editor helpers,
custom-column-3 CustomExpressionEditor ports, charts/table/ui — all read-only.
New spec-local helpers live in support/offset.ts as instructed.

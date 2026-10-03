# visualizer-columns-mapping

Port of `e2e/test/scenarios/dashboard/visualizer/columns-mapping.cy.spec.ts`
→ `tests/visualizer-columns-mapping.spec.ts`. 2 tests, both green on the jar
(slot 2), 4/4 under `--repeat-each=2`. No product bugs; no `test.fixme`.

## New helpers
`support/visualizer-columns-mapping.ts` — only what the shared visualizer
modules didn't already export:
- `ACCOUNTS_COUNT_BY_COUNTRY` fixture + `COUNTRY_CODES` list (from
  `e2e/support/test-visualizer-data.ts`).
- `clickUndoButton` (`H.clickUndoButton`).

Everything else (`clickVisualizeAnotherWay`, `openQuestionsSidebar`,
`selectVisualization`, `assertDataSourceColumnSelected`, `assertWellItems`, the
well locators, `createQuestion`/`createDashboard`) imported read-only from
`visualizer-basics.ts`; `echartsTextExact` from `visualizer-cartesian.ts`.

## Fixes classified

- **Known gotcha (rule 1 — findByLabelText is exact).** `H.clickUndoButton`'s
  `cy.findByLabelText("Undo")` ported as a bare `getByLabel("Undo")` blew up on
  a strict-mode violation: Playwright's `getByLabel` is a case-insensitive
  substring, so "Undo" matched three nodes — the `undo-list` wrapper
  (`aria-label="undo-list"`), the button (`aria-label="Undo"`), and the icon
  (`aria-label="undo icon"`). Faithful port is exact:
  `getByLabel("Undo", { exact: true })` → resolves to just the button. This is
  the standard rule-1 case, applied to `getByLabel`.

## Notes (no finding)
- beforeEach creates two questions via upstream idAlias/wrapId, but neither id
  is ever read — the questions only need to exist in the "Add questions"
  sidebar. Dropped the aliasing.
- Dropped never-awaited intercepts `@dataset`/`@cardQuery`/`@dashcardQuery`.
- Pie total "18,760" is ECharts SVG text → whitespace-tolerant
  `echartsTextExact` (getByText doesn't trim).

## Consolidation dividend (flag)
Reinforces the standing "unify the visualizer helper surface" candidate: this
port needed a THIRD tiny `visualizer-*.ts` file for two fixtures + a one-line
`clickUndoButton`, purely because `visualizer-basics.ts`/`visualizer-cartesian.ts`
are import-only under the parallel-agent rule. `ACCOUNTS_COUNT_BY_COUNTRY`,
`COUNTRY_CODES`, and `clickUndoButton` all belong in the eventual shared
`support/visualizer.ts`.

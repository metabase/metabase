# combo.cy.spec.js → tests/combo.spec.ts

Combo chart (mixed line + bar + area series, per-series display type, stacking,
value labels). 2 tests, both green on the jar (slot 5), 4/4 under
`--repeat-each=2`.

## Fixes / classification
None. Clean port — no gotchas hit, no `test.fixme`, no product-bug claims.

## Helpers
No new helpers needed. Everything imported read-only from shared modules:
- `visitAdhoc`, `cartesianChartCircleWithColor`, `assertEChartsTooltip`,
  `vizSettingsSidebar` — viz-charts-repros.ts
- `openVizSettingsSidebar` — charts.ts
- `ensureChartIsActive` — metrics-explorer.ts
- `chartPathWithFillColor`, `echartsText` — legend.ts
- `triggerMousemove` — line-chart.ts

`support/combo.ts` was NOT created (no new helpers).

## Notes (faithful-port choices, not findings)
- Dropped the explicit `displayIsLocked: true` from the adhoc payloads:
  `adhocQuestionHash` (permissions.ts) already sets it whenever `display != null`,
  so the produced URL hash is byte-identical. Faithful.
- `H.echartsContainer().findByText(...)` for the "408.66" data label and the
  "100%" y-axis tick → `echartsText` (whitespace-tolerant exact regex) per the
  axis-text-whitespace rule — SVG `<text>` can carry padding. `.first()` because
  the regex is not a unique-match guarantee.
- `.trigger("mousemove")` on line/area circles → `triggerMousemove` (synthetic
  MouseEvent dispatch, not a real hover); `.realHover()` on the bar path →
  plain `.hover()` (no `{ force }` needed — the bar path is the hit target).
- The stacked-tooltip "Total" row has no series color; `assertEChartsTooltip`
  handles the optional `color` and `secondaryValue` fields.

## Dividends
None flagged.

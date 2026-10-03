# sankey.spec.ts (visualizations-charts/sankey.cy.spec.js)

3 tests, all green on the jar (slot 1), 6/6 under `--repeat-each=2`. tsc clean.
No product bugs, no fixmes.

## Fixes classified

- **Known gotcha (ECharts hover intercept → force).** `sankeyEdge(...).nth(8).hover()`
  and the node `chartPathWithFillColor("#E75454").first().hover()` both timed out:
  the edge/node value-label `<text>` (e.g. "5.0k") overlays the path and
  intercepts a real hover (zrender hit-tests by coordinate). Cypress's
  `.realHover()` fires at the coordinate regardless. Fix: `hover({ force: true })`.
  This is the same class already documented for pie/label hovers
  ("ECharts pie/label hovers need `hover({ force: true })`"); it also applies to
  sankey edges and nodes. Only surfaces once value labels are enabled (the edge
  hover) — the node hover always has a leader label over it.

## Port notes (no new gotchas)

- Native ad-hoc query (`type: "native"`) → `visitNativeAdhoc` (autorun-false +
  runNativeQuery), per the existing waterfall precedent.
- ECharts node/edge `<text>` labels matched with `echartsText` (legend.ts) for
  whitespace tolerance — the axis-text-whitespace rule. Held for "Social Media",
  "60,000", "60.0k".
- `cy.intercept("/api/session/properties", req => req.continue(res =>
  res.body["token-features"].development_mode = …))` → `mockDevelopmentMode`
  (support/sankey.ts): a `page.route` that re-fetches and pokes the nested key,
  mirroring admin-extras.mockSessionProperty. Both dev-mode variants pass; the
  flag doesn't change the asserted drill/render behaviour (faithful port).

## New helpers (support/sankey.ts)

- `sankeyEdge(page, color)` — port of H.sankeyEdge: `path[fill=…][fill-opacity="0.2"]`.
  Consolidation candidate: fold into a charts module alongside
  chartPathWithFillColor / pieSlices / trendLine.
- `mockDevelopmentMode(page, devMode)` — nested-key sibling of
  admin-extras.mockSessionProperty.

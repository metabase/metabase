---
name: visualization-settings
description: Choosing a card's `display` and authoring `visualization_settings` for question_write and patch_dashcard — which chart fits which data shape, the output-column-name rule, minimum keys per chart family, map regions, the column_settings JSON-string-key footgun. Triggers — "make this a bar/line/pie chart", "what chart should I use", "format as currency", "the card renders as a table instead of a chart", "conditional formatting", "region map".
---

# Visualization: pick the chart, then set it

Two fields, set through `question_write` and mergeable per dashcard via `dashboard_write`'s `patch_dashcard`:

- **`display`** — `table`, `bar`, `line`, `area`, `row`, `pie`, `scalar`, `smartscalar`, `combo`, `pivot`, `funnel`, `map`, `scatter`, `waterfall`, `progress`, `gauge`, `sankey`. Nothing else: an unknown value (`bargraph`, `histogram`, `number`) is accepted and renders nothing; `scalar` **is** the Number viz.
- **`visualization_settings`** — a map keyed per display (`graph.*`, `pie.*`, `table.*`, …). **Nothing validates it**: unknown or wrong-display keys are stored and ignored; a wrong binding renders blank or falls back to a table. Feedback is read-back, not errors.

## Step 1 — display by data shape

- **Single number** → `scalar`; `smartscalar` for change vs previous period (needs a time breakout); `gauge`/`progress` for value vs target.
- **Measure across categories** → `bar`; `row` (horizontal) for long or many labels.
- **Trend** → `line`; `area` for stacked composition over time; `combo` for two related measures on unlike scales (never unrelated ones). Never `scalar`/`pie` for a trend.
- **Part-to-whole** → `pie`, ≤5 slices only; beyond that a sorted `bar`/`row`.
- **Distribution** → `bar` histogram (bin the field — `learn("query-dialect")`, binning).
- **Correlation** → `scatter` (third measure → bubble size).
- **Contributions to a total** → `waterfall`; **stage drop-off** → `funnel`; **flow between nodes** → `sankey`.
- **Geographic** → `map` (region/choropleth, or pin/grid from lat+long).
- **Precise values, many columns, nothing fits** → `table`; `pivot` for a two-dimension cross-tab.

## Step 2 — bind output columns

**Every binding key takes output column-name strings, never field ids** — the names the query produces: a `count` aggregation is `count`, a breakout its field's name, a named aggregation its `name` option, a second `sum` in a stage `sum_2`. Empty `{}` is valid for a simple aggregate (auto-bound); set keys to pin or override:

```json
{"display": "bar",
 "visualization_settings": {"graph.dimensions": ["CATEGORY"], "graph.metrics": ["count"]}}
```

- `bar`/`line`/`area`/`combo`/`row`/`scatter`: `graph.dimensions` (x; a 2nd entry = series breakout), `graph.metrics` (y). Stacked: `"stackable.stack_type": "stacked"` (`"normalized"` = 100%).
- `pie`: `{"pie.dimension": "CATEGORY", "pie.metric": "count"}`
- `scalar`: `{"scalar.field": "count"}` (only with >1 column)
- `funnel`: `{"funnel.dimension": "STAGE", "funnel.metric": "count"}`
- `map` region: `{"map.type": "region", "map.region": "us_states", "map.dimension": "STATE", "map.metric": "count"}`. `map.region`: `"us_states"` (dimension values = 2-letter state codes or state names, `"CA"`/`"California"`), `"world_countries"` (2-letter ISO codes or country names, `"US"`/`"United States"`), or an admin-added custom-GeoJSON key. Pin/grid: `"map.type": "pin"` + `map.latitude_column` + `map.longitude_column`.
- `sankey`: `{"sankey.source": "FROM", "sankey.target": "TO", "sankey.value": "count"}`
- `waterfall`: exactly one dimension + one metric.
- `table`: always renders; `table.columns` (`[{"name": …, "enabled": …}]`) orders and hides columns.

## `column_settings`: JSON-string keys

Per-column formatting keys are **JSON-encoded arrays passed as strings**, inner quotes escaped — never an object key:

```json
"visualization_settings": {
  "column_settings": {
    "[\"name\",\"TOTAL\"]": {"number_style": "currency", "currency": "USD", "decimals": 2},
    "[\"name\",\"CREATED_AT\"]": {"date_style": "MMMM D, YYYY"}}}
```

Always author `["name", "<output column>"]`. A `["ref", ["field", id, opts]]` key appears in read-back — don't author it; when editing such a card keep those keys verbatim.

## Escape hatch and catalog

For anything intricate — combo charts, conditional formatting, pivot splits, click behavior — `get_content` a UI-built card with the look you want and reuse its `visualization_settings` verbatim; the server produced it, so it's valid for that display. Every key with values and defaults, `series_settings`, conditional formatting, pivot splits, dashcard click behavior: `learn("visualization-settings", "settings")`.

## Don't

- Don't invent display values — accepted, renders nothing.
- Don't put field ids in `graph.dimensions` / `pie.metric` / `scalar.field` — output column names only, or the chart renders blank.
- Don't write a `column_settings` key as an object, or author the `["ref", …]` form — ignored.
- Don't pick `pie` for >5 slices, `combo` for unrelated metrics, or `scalar`/`pie` for a trend — renders, misleads.
- Don't report a chart as rendering from the write response — nothing validates settings.

## To confirm

`get_content {"type": "question", "id": <id>}` returns `display` and `visualization_settings` as stored — proof the settings saved, not that the chart renders. Rendering (a region whose values don't match, a binding to a missing column) has no API check: call it unverified unless the user has viewed the card.

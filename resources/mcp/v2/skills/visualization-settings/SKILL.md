---
name: visualization-settings
description: Choosing a card's `display` and authoring `visualization_settings` for question_write and dashboard_write's patch_dashcard — which chart fits which data shape, the rule that settings name output columns, minimum keys per chart family, and the column_settings JSON-string-key footgun. Triggers — "make this a bar/line/pie chart", "what chart should I use", "format as currency", "the card renders as a table instead of a chart", "conditional formatting".
---

# Visualization: pick the chart, then set it

A card has two presentation fields alongside its query, both set through `question_write` (`display`, `visualization_settings`) and mergeable on a dashcard via `dashboard_write`'s `patch_dashcard`:

- **`display`** — the chart type. Valid values: `table`, `bar`, `line`, `area`, `row`, `pie`, `scalar`, `smartscalar`, `combo`, `pivot`, `funnel`, `map`, `scatter`, `waterfall`, `progress`, `gauge`, `sankey`.
- **`visualization_settings`** — a map whose keys are namespaced by display (`graph.*`, `pie.*`, `table.*`, …). **Nothing validates it**: unknown keys and keys for a different display are stored and silently ignored, and a wrong binding renders a blank chart or falls back to a table. The feedback loop is read-back (`get_content`), not validation errors.

## Step 1 — pick the display for the data

- **Single headline number** → `scalar`; `smartscalar` when the story is the change vs the previous period (needs a time breakout); `gauge`/`progress` for a value against a target.
- **Compare a measure across categories** → `bar`; `row` (horizontal) when labels are long or numerous.
- **Trend over time** → `line`; `area` for composition over time (stacked); `combo` for two related measures on unlike scales.
- **Part-to-whole snapshot** → `pie`, only with ≤5 slices — beyond that a sorted `bar`/`row`.
- **Distribution** → a `bar` histogram (bin the numeric field — see `learn("query-dialect")`, binning).
- **Correlation of two measures** → `scatter` (third measure → bubble size).
- **Sequential contributions to a total** → `waterfall`; **stage drop-off** → `funnel`; **flow between nodes** → `sankey`.
- **Geographic** → `map` (region/choropleth, or pin/grid from lat+long).
- **Precise values, many columns, or nothing fits** → `table`; `pivot` for a two-dimension cross-tab.

## Step 2 — bind output columns

**Every binding key takes output column-name strings** — the names the query *produces*, never field ids. A `count` aggregation outputs `count`; a breakout outputs the field's name; a named aggregation outputs its `name` option. (Second `sum` in a stage → `sum_2`.)

Minimum viable settings per family — empty `{}` is valid for a simple aggregate (the binding is auto-picked); set keys to pin or override:

```json
{"display": "bar",
 "visualization_settings": {"graph.dimensions": ["CATEGORY"], "graph.metrics": ["count"]}}
```

- `bar`/`line`/`area`/`combo`/`row`/`scatter` share the key set: `graph.dimensions` (x-axis; a 2nd entry becomes a series breakout), `graph.metrics` (y). Stacked: `"stackable.stack_type": "stacked"` (or `"normalized"` for 100%).
- `pie`: `{"pie.dimension": "CATEGORY", "pie.metric": "count"}`
- `scalar`: `{"scalar.field": "count"}` (only needed with >1 column)
- `funnel`: `{"funnel.dimension": "STAGE", "funnel.metric": "count"}`
- `map` (region): `{"map.type": "region", "map.region": "us_states", "map.dimension": "STATE", "map.metric": "count"}`; pin/grid take `map.latitude_column` + `map.longitude_column`.
- `sankey`: `{"sankey.source": "FROM", "sankey.target": "TO", "sankey.value": "count"}`
- `waterfall`: exactly one dimension + one metric.
- `table`: renders anything; `table.columns` (`[{"name": …, "enabled": …}]`) orders and hides columns.

## `column_settings`: the JSON-string-key footgun

Per-column formatting lives under `column_settings`, a map **whose keys are JSON-encoded arrays passed as strings** — inside a JSON body the inner quotes are escaped:

```json
"visualization_settings": {
  "column_settings": {
    "[\"name\",\"TOTAL\"]": {"number_style": "currency", "currency": "USD", "decimals": 2},
    "[\"name\",\"CREATED_AT\"]": {"date_style": "MMMM D, YYYY"}}}
```

Always use the `["name", "<output column>"]` key form. (A legacy `["ref", ["field", id, opts]]` form exists in read-back — its inner ref uses the legacy id-second order; don't author it.)

## Escape hatch

For anything intricate — combo charts, conditional formatting, pivot splits, click behavior — the cheapest correct path is to copy a working card: `get_content` a UI-built card with the look you want and reuse its `visualization_settings` verbatim; the server produced it, so it's valid for that display.

The full per-chart key catalog — every key with values and defaults, `series_settings`, conditional formatting, pivot splits, dashcard click behavior — is `learn("visualization-settings", "settings")`.

## Don't

- Don't invent display values (`bargraph`, `histogram`, `number`) — an unknown display is accepted and renders nothing; `scalar` **is** the Number viz.
- Don't put field ids in `graph.dimensions` / `pie.metric` / `scalar.field` — output column-name strings only.
- Don't write a `column_settings` key as an object — it is a JSON **string**, inner quotes escaped.
- Don't pick `pie` for >5 slices, `combo` for unrelated metrics, or `scalar`/`pie` for a trend.
- Don't expect validation to catch a viz mistake — read the card back (or view it) to confirm.

# visualization_settings — per-chart key reference

Authorable keys per `display`, the data shape each chart suits, and the minimum to render. Set keys only to override defaults — empty `{}` works for a simple aggregate. All column-naming keys take **output column-name strings** (the names the query produces). In a JSON body, `column_settings` keys are escaped strings: `"[\"name\",\"TOTAL\"]"`.

Saved-card settings ride `question_write`'s `visualization_settings`; dashcard-level overrides (and everything marked *dashcards only*) merge in via `dashboard_write`'s `patch_dashcard` op, whose `visualization_settings` patch merges key by key.

## Cartesian — `bar`, `line`, `area`, `combo`, `scatter`, `waterfall`, `row`

`bar`/`line`/`area`/`combo` share one key set (combo defaults the first series to a line, the rest to bars). Most allow up to 2 dimensions and unlimited metrics; **waterfall is 1 dimension + 1 metric**.

Data binding:

| Key | Type | Notes |
|---|---|---|
| `graph.dimensions` | string[] | X-axis. Index 0 = x-axis; a 2nd entry = series breakout. |
| `graph.metrics` | string[] | Y-axis metric column(s). |
| `graph.series_order` | object[] | Per-series order/visibility `{key, name, color, enabled}` (breakout only). |

Stacking: `stackable.stack_type` — `null`, `"stacked"`, `"normalized"` (100%; incompatible with a `log` y-scale).

Goal & trend: `graph.show_goal` (bool), `graph.goal_value` (number), `graph.goal_label` (string), `graph.show_trendline` (bool).

Data labels: `graph.show_values` (bool), `graph.label_value_frequency` (`"fit"`/`"all"`), `graph.show_stack_values` (`"total"`/`"series"`/`"all"`, stacked bars), `graph.label_value_formatting` (`"auto"`/`"compact"`/`"full"`).

Axes: `graph.x_axis.scale` (`"timeseries"` `"linear"` `"pow"` `"log"` `"histogram"` `"ordinal"`), `graph.y_axis.scale` (`"linear"` `"pow"` `"log"`), `graph.x_axis.axis_enabled` (`true`/`false`/`"compact"`/`"rotate-45"`/`"rotate-90"`), `graph.y_axis.axis_enabled` (bool), `graph.y_axis.auto_range` (bool) with `graph.y_axis.min`/`.max`, `graph.y_axis.unpin_from_zero` (bool), `graph.y_axis.auto_split` (bool), `graph.x_axis.title_text` / `graph.y_axis.title_text`.

Tooltip: `graph.tooltip_columns` (string[] — extra columns on hover).

Extras: `scatter.bubble` (numeric column name → bubble size). Waterfall: `waterfall.increase_color`, `waterfall.decrease_color`, `waterfall.show_total` (bool), `waterfall.total_color`. Row charts: `graph.dimensions` is the y-axis (categories), x-scale `"ordinal"` only.

## Part-to-whole & single value

**pie** — required `pie.dimension` (string, or array for up to 3 concentric rings), `pie.metric`. Optional: `pie.show_legend`, `pie.show_total`, `pie.show_labels`, `pie.percent_visibility` (`"off"`/`"legend"`/`"inside"`/`"both"`), `pie.decimal_places`, `pie.slice_threshold` (min % before grouping into "Other", default 2.5).

**funnel** — required `funnel.dimension` (stage), `funnel.metric` (value). Optional: `funnel.type` (`"funnel"`/`"bar"`), `funnel.rows` (`[{key, name, enabled}]` step order).

**gauge** — `gauge.segments`: `[{min, max, color?, label?}]` (min/max required per segment).

**progress** — `progress.value` (column, only if >1 numeric), `progress.goal` (number or column name), `progress.color`.

**scalar** — `scalar.field` (only if >1 column), `scalar.segments` (`[{min, max, color, label}]` thresholds). Number formatting (currency, decimals) is per-column in `column_settings`, not here.

**smartscalar** — needs one value grouped by a single time field. `scalar.field`, `scalar.switch_positive_negative`, `scalar.compact_primary_number`, and `scalar.comparisons` (up to 3): `{id, type}` with type `"previousPeriod"` | `"previousValue"` | `"periodsAgo"` (+`value`) | `"staticNumber"` (+`value`,`label`) | `"anotherColumn"` (+`column`,`label`).

## Tabular, geographic & flow

**table** — always renders. `table.columns` (`[{name, enabled}]` order + visibility), `table.column_formatting` (below), `table.pivot` (bool; simple in-table pivot of 2 dims + 1 metric) with `table.pivot_column`/`table.cell_column`, `table.pagination`, `table.row_index`, `table.freeze_columns` + `table.freeze_columns_count`, `table.freeze_rows` + `table.freeze_rows_count`.

Conditional formatting — `table.column_formatting` is a list of rules:

```json
[{"columns": ["TOTAL"], "type": "single", "operator": ">", "value": 100,
  "color": "#84BB4C", "highlight_row": false},
 {"columns": ["RATING"], "type": "range", "colors": ["#ED6E6E", "#F9CF48", "#84BB4C"],
  "min_type": "custom", "min_value": 1, "max_type": "custom", "max_value": 5}]
```

`single` operators: `=` `!=` `<` `>` `<=` `>=` `is-null` `not-null` `contains` `does-not-contain` `starts-with` `ends-with` `is-true` `is-false`. `range` `min_type`/`max_type`: `"custom"`, `"all"`, or null.

**pivot** — needs an aggregated query built in the query builder (not native). `pivot_table.column_split`: `{"rows": [...names], "columns": [...names], "values": [...names]}`; `pivot.show_row_totals`, `pivot.show_column_totals`, `pivot.condense_duplicate_totals` (bools); `pivot_table.column_formatting` (as table's). Per-column under `column_settings`: `pivot_table.column_sort_order` (`"ascending"`/`"descending"`), `pivot_table.column_show_totals` (bool).

**map** — `map.type`: `"region"` (choropleth), `"pin"`, `"grid"`. Region: `map.region` (`"us_states"`, `"world_countries"`, or a custom-geojson key), `map.dimension`, `map.metric`, `map.colors`. Pin/grid: `map.latitude_column`, `map.longitude_column`, `map.metric_column`, `map.pin_type` (`"tiles"`/`"markers"`/`"grid"`/`"heat"`), `map.heat.radius`/`.blur`/`.min-opacity`/`.max-zoom`.

**sankey** — `sankey.source`, `sankey.target`, `sankey.value` (column names; distinct source/target forming an acyclic flow, ≤150 nodes); `sankey.node_align` (`"left"`/`"right"`/`"justify"`), `sankey.show_edge_labels` (bool), `sankey.label_value_formatting` (`"auto"`/`"compact"`/`"full"`), `sankey.edge_color` (`"gray"`/`"source"`/`"target"`).

## `column_settings` — per-column formatting

Keyed by the JSON-string form of `["name", "<output column>"]`. Applies to table, pie, cartesian charts, scalar, and object detail.

| Key | Values | Applies to |
|---|---|---|
| `column_title` | string — header override | all |
| `text_align` | `"left"` `"right"` `"middle"` | table |
| `view_as` | null (text), `"link"`, `"email_link"`, `"image"`, `"auto"` | table |
| `link_text` / `link_url` | strings; `{{COLUMN}}` interpolates row values | table |
| `show_mini_bar` | bool — inline bar in the cell | number |
| `text_wrapping` | bool | string |
| `number_style` | `"decimal"` `"currency"` `"percent"` `"scientific"` | number |
| `currency` / `currency_style` / `currency_in_header` | ISO code; `"symbol"` `"narrowSymbol"` `"code"` `"name"`; bool | currency |
| `number_separators` | `".,"` `", "` `",."` `"."` `".’"` | number |
| `decimals` / `scale` / `prefix` / `suffix` | number, factor, affixes | number |
| `date_style` | moment.js format, e.g. `"MMMM D, YYYY"` | date |
| `date_separator` / `date_abbreviate` | `"/"` `"-"` `"."`; bool | date |
| `time_enabled` / `time_style` | null `"minutes"` `"seconds"` `"milliseconds"`; e.g. `"h:mm A"` | date+time |
| `click_behavior` | object — **dashcards only** (below) | all |

## `series_settings` — per-series styling (cartesian)

Keyed by series name: the metric column's name (single series) or the breakout value (broken-out).

| Key | Values |
|---|---|
| `title` | series label |
| `color` | hex color |
| `display` | `"line"` `"area"` `"bar"` — per-series type (combo) |
| `line.interpolate` | `"linear"` `"cardinal"` `"step-after"` |
| `line.style` / `line.size` | `"solid"` `"dashed"` `"dotted"`; `"S"` `"M"` `"L"` |
| `line.marker_enabled` | null (auto) / bool |
| `line.missing` | `"zero"` `"none"` `"interpolate"` |
| `axis` | null (auto) / `"left"` / `"right"` |
| `show_series_values` / `show_series_trendline` | bool |

```json
"series_settings": {"revenue": {"display": "line", "color": "#509EE3", "axis": "left"}}
```

## Click behavior — dashcards only

Click behavior lives on a **dashcard** (`patch_dashcard`'s `visualization_settings` patch, whole-card, or inside `column_settings[<key>].click_behavior` per column) — never on a saved card; the interactive types need the surrounding dashboard. `type` is `"actionMenu"` (default drill menu), `"crossfilter"` (clicked value feeds a dashboard parameter), or `"link"`.

Crossfilter — the driver chart emits the value; map the same parameter onto the follower cards normally (the driver stays unwired to it):

```
dashboard_write {"method": "update", "id": 40,
 "ops": [{"op": "patch_dashcard", "dashcard_id": 7,
          "patch": {"visualization_settings": {
            "click_behavior": {
              "type": "crossfilter",
              "parameterMapping": {
                "category": {"id": "category",
                             "source": {"type": "column", "id": "CATEGORY", "name": "Category"},
                             "target": {"type": "parameter", "id": "category"}}}}}}}]}
```

Link — `linkType` `"url"` (a `linkTemplate` like `"https://app/orders/{{ORDER_ID}}"`; `{{column}}` = clicked row value, `{{filter:param}}` = a dashboard parameter's value), or `"question"`/`"dashboard"` (`targetId`, optional `parameterMapping` passing clicked context). Keys are camelCase. A native-SQL card supports only crossfilter and link — no drill-through.

For a complex behavior, build it once in the UI and copy the dashcard's settings via `get_content` rather than hand-authoring.

## Virtual dashcards

Text/heading/link/iframe tiles are created with their own `dashboard_write` ops (`add_text`, `add_heading`, `add_link`, `add_iframe`) — never author their `virtual_card` settings by hand. A text, heading, or iframe card's content may carry `{{param}}` placeholders, bound to a dashboard parameter with a raw text-tag target:

```
dashboard_write {"method": "update", "id": 40,
 "ops": [{"op": "wire_parameter", "parameter_id": "region", "dashcard_id": 7,
          "target": ["text-tag", "region"]}]}
```

The tag name must appear as `{{region}}` in the card's own text (or iframe embed).

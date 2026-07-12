---
name: visualization
description: Choose a chart and configure it — the `display` types a question can take, which query shape each one needs, and the `visualization_settings` keys that name the axes, pick the series, set a goal line, format columns, and stack a bar chart. Load when saving a question as anything other than a table, when a chart renders empty or wrong, or when asked to change how a result looks. Triggers — "show it as a line chart", "make it a bar chart by category", "add a goal line", "format as currency", "the chart is empty".
---

# Visualization

A saved question carries a `display` (the chart type) and `visualization_settings` (how that chart is
configured). Both are fields on `question_write`; `visualize_query` renders a query in the chat client
without saving anything.

The chart follows the query, not the other way round. A bar chart needs a breakout to put on the x
axis; a trend needs a time series; a scalar needs exactly one number. If a chart renders empty, the
query shape is usually the reason — fix the query, not the settings.

## Display types

| `display` | Needs | Use for |
| --- | --- | --- |
| `table` | anything | raw rows; the default |
| `bar`, `row` | 1 breakout + ≥ 1 aggregation | comparison across categories (`row` = horizontal) |
| `line`, `area` | a temporal breakout + ≥ 1 aggregation | change over time |
| `combo` | a breakout + ≥ 2 aggregations | bars and a line together |
| `scalar` | one aggregation, no breakout | a single number |
| `smartscalar` | one aggregation + a temporal breakout | a number with its trend vs the previous period |
| `pie` | 1 breakout + 1 aggregation, few categories | share of a whole |
| `scatter` | 2+ numeric columns | correlation |
| `funnel` | an ordered breakout + 1 aggregation | stage-to-stage drop-off |
| `gauge`, `progress` | one number | a number against a target |
| `map` | a region or lat/lon column | geography |
| `waterfall` | a breakout + 1 aggregation | contributions to a total |
| `pivot` | 2+ breakouts | a cross-tab |
| `sankey`, `treemap`, `boxplot`, `object`, `list` | see the app | specialist views |

## Settings that matter

`visualization_settings` is an open map; these are the keys you'll actually need.

```json
{"graph.dimensions": ["CREATED_AT"],
 "graph.metrics": ["count"],
 "graph.x_axis.title_text": "Month",
 "graph.y_axis.title_text": "Orders",
 "graph.show_values": true,
 "graph.show_goal": true,
 "graph.goal_value": 1000,
 "stackable.stack_type": "stacked",
 "column_settings": {"[\"name\",\"TOTAL\"]": {"column_title": "Revenue",
                                              "number_style": "currency",
                                              "currency": "USD",
                                              "decimals": 2}}}
```

- **`graph.dimensions` / `graph.metrics`** — which columns are the x axis and which are the series, by
  **column name** (the machine name the query returns: `count`, `sum`, `CREATED_AT`). Set these
  explicitly on any chart with more than one candidate column; guessing is how a chart ends up plotting
  the wrong series.
- **`graph.show_goal` + `graph.goal_value`** — the goal line. An alert with a `goal_above` /
  `goal_below` condition requires one on the chart, so set it before creating that alert.
- **`stackable.stack_type`** — `"stacked"` or `"normalized"` (100%), on bar and area charts.
- **`column_settings`** — per-column formatting, keyed by the JSON string `["name","COLUMN"]`. Common
  values: `column_title`, `number_style` (`decimal`, `percent`, `currency`, `scientific`), `currency`,
  `decimals`, `prefix`, `suffix`, `show_mini_bar`.
- **`scalar.field`** — which column a `scalar` shows when the result has several.
- **`pie.dimension` / `pie.metric`** — the pie equivalents of dimensions/metrics.
- **`series_settings`** — per-series overrides keyed by series name: `{"count": {"color": "#509EE3",
  "display": "line", "title": "Orders"}}`, which is how a `combo` decides what's a bar and what's a
  line.

## On a dashboard

A dashboard card can override the question's own settings without touching the saved question — that's
`dashboard_write`'s `{op: "patch_dashcard", dashcard_id, patch}` (see the `dashboard` skill). Use it
for `card.title`, `card.hide_empty`, and `click_behavior`. Change the *question's* own chart with
`question_write` instead; every dashboard showing it will follow.

## In chat

`visualize_query(query_handle)` renders a chart inline in clients that support it. It takes the handle
`execute_query` or `execute_sql` already returned — don't re-run the query to get one, and don't call
`execute_query` again afterwards to "show the numbers": the chart is the answer.

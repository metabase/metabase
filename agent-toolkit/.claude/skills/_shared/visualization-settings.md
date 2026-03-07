# Visualization Types and Settings

## Display Types

| Type | Use for | Key settings |
|------|---------|-------------|
| `table` | Detailed data (default) | none needed |
| `line` | Time series, trends | x_axis, y_axis |
| `bar` | Comparisons, distributions | x_axis, y_axis, stack |
| `area` | Cumulative, stacked trends | x_axis, y_axis, stack |
| `combo` | Mixed chart types | x_axis, y_axis |
| `scatter` | Correlations | x_axis, y_axis |
| `waterfall` | Sequential changes | x_axis, y_axis |
| `pie` | Part-of-whole | dimension, metric |
| `row` | Horizontal bar chart | x_axis, y_axis |
| `scalar` | Single KPI number | none |
| `smartscalar` | KPI with trend | none |
| `gauge` | Progress toward target | none |
| `progress` | Progress bar | none |
| `pivot` | Cross-tabulations | x_axis, y_axis |
| `funnel` | Conversion funnels | x_axis, y_axis |
| `map` | Geographic data | map_type, map_region |
| `boxplot` | Statistical distribution | x_axis, y_axis |
| `sankey` | Flow diagrams | x_axis, y_axis |

## Settings Object

All settings are optional. The CLI translates these to Metabase's internal format.

| CLI key | Metabase key | Type | Notes |
|---------|-------------|------|-------|
| `x_axis` | `graph.dimensions` | string[] | X axis columns |
| `y_axis` | `graph.metrics` | string[] | Y axis columns |
| `stack` | `stackable.stack_type` | `"stacked"` / `"normalized"` | bar/area |
| `show_values` | `graph.show_values` | boolean | data labels |
| `x_axis_label` | `graph.x_axis.title_text` | string | axis title |
| `y_axis_label` | `graph.y_axis.title_text` | string | axis title |
| `line_style` | `line.style` | `"solid"` / `"dashed"` / `"dotted"` | |
| `line_interpolation` | `line.interpolate` | `"linear"` / `"cardinal"` / `"monotone"` | |
| `dimension` | `pie.dimension` | string[] | pie categories |
| `metric` | `pie.metric` | string | pie value column |
| `show_legend` | `pie.show_legend` | boolean | |
| `map_type` | `map.type` | `"pin"` / `"region"` / `"grid"` | |
| `map_region` | `map.region` | string | |

## Column Name Matching

`x_axis` and `y_axis` values must match SQL column aliases exactly:

```sql
SELECT DATE_TRUNC('month', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1
```
Correct: `"x_axis": ["month"], "y_axis": ["revenue"]`
Wrong: `"x_axis": ["created_at"], "y_axis": ["total"]`

## Chart-Specific Notes

- **pie**: Use `dimension` and `metric` instead of `x_axis`/`y_axis`
- **scalar/smartscalar**: SQL should return one row, one column. No viz settings needed.
- **gauge/progress**: SQL should return a single numeric value.
- **pivot**: `x_axis` columns become row headers, `y_axis` is the aggregated value.

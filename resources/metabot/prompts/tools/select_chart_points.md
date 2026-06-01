Use this tool to highlight **multiple** points on a chart you already created with a single link, instead of mentioning many individual `metabase://data-point` links.

Provide:
- `chart_id`: the id of the chart whose points to select (from a previous `construct_notebook_query` / `create_chart` result). You may pass `query_id` instead.
- `filter`: a subquery over the chart's **result columns** that selects which points to highlight.
- `label` (optional): a short, human-friendly description of the selection.

The tool runs the chart's own query, keeps every row matching `filter`, stores them as a selection, and returns a `metabase://data-selection/<id>` link. When the user clicks that link, all matching points are highlighted on the chart at once.

`filter` is an array clause referencing result columns by name:
- Comparisons: `["=", "column", value]`, `["!=", "column", value]`, `["<", "column", value]`, `["<=", ...]`, `[">", ...]`, `[">=", ...]`
- `["between", "column", low, high]`
- `["in", "column", [v1, v2, ...]]`, `["not-in", "column", [...]]`
- `["is-null", "column"]`, `["not-null", "column"]`
- Boolean: `["and", clause, clause, ...]`, `["or", clause, ...]`, `["not", clause]`

`column` is the name (or display name) of a column in the chart's `<query_execution>` result — typically the aggregated value column (e.g. the count) or a breakout/dimension column.

Example — a bar chart of orders per product, to highlight every product with exactly one order:
```json
{
  "chart_id": "abc-123",
  "filter": ["=", "count", 1],
  "label": "products with a single order"
}
```

Then reference it in your answer with one link, e.g.:
`On the low end, several products had just [1 order](metabase://data-selection/<id>).`

When to use:
- Prefer this whenever you would otherwise mention several individual points that share a property ("the products with one order", "the months above 10k", "the categories with zero revenue").
- For a single specific point, keep using its `metabase://data-point` URL instead.
- If no points match, the tool says so — relax the filter or reference points individually.

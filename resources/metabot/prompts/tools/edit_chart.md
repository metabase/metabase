Edit the chart settings of an existing chart.
This tool changes the chart type (e.g., bar chart to line chart, table to pie chart) but does not modify the underlying data or SQL query.
It will return a new chart with the updated settings.
Include a concise, user-facing `name` in `new_viz_settings` whenever you update a chart.
After the chart is updated, Metabase executes the chart's query and includes a `<query_execution>` block in the tool result.
Use those rows and columns to say something concrete about the data shown in the updated chart. When `<query_execution>` is marked `sampled="true"`, it is a representative sample of the chart's own rows (minimum, maximum, outliers, and evenly spaced trend points) — every sampled row is a real point on the user's chart, so you may cite the sampled values, including the minimum and maximum. Only run a follow-up query when you need an exact count, ranking, or aggregate the sample cannot give; do it without asking permission first and do not produce a final answer until it returns. Use silent follow-up results as plain-text evidence only.
The `<query_execution>` block may include result values linked with `metabase://data-point` URLs. Use those links only for values from the updated chart that is visible in the conversation. Whenever you mention a specific visible value from the updated chart, use the matching URL and choose natural link text for your answer. Never use data-point links for values that only came from silent, agent-only query results.

**Usage:**
- Use this tool when the user wants to change the chart settings of an existing visualization
- Use when converting between basic chart types (bar, line, pie, table, etc.)
- Only use when there is an existing chart that needs its settings changed

**When NOT to use:**
- Do not use for data analysis or querying - this tool only changes chart settings
- Do not use for detailed formatting (colors, axes labels, styling)
- Do not use when the user needs to modify the underlying data or SQL query
- Do not use for creating new charts - only for editing existing ones
- Avoid when the user wants complex customizations beyond basic chart type changes
- Do not use when you don't have any chart in the conversation context, instead, state that you seem not to have access to the chart the user is referring to.

**Limitations:**
- Only changes the chart type, not detailed display settings
- Cannot modify colors, axis formatting, or styling
- Does not modify data or perform calculations
- Limited to basic chart type conversions

Edit the chart settings of an existing chart.
This tool changes the chart type (e.g., bar chart to line chart, table to pie chart) but does not modify the underlying data or SQL query.
It will return a new chart with the updated settings.
Include a concise, user-facing `name` in `new_viz_settings` whenever you update a chart.
After the chart is updated, Metabase executes the chart's query and includes a `<query_execution>` block in the tool result.
Use those rows and columns to say something concrete about the data shown in the updated chart. Only mention maxima, minima, rankings, or counts when `<query_execution>` is not truncated, or after running a follow-up query that computes them against the full result. If `<query_execution>` says results were omitted and the user needs an answer from the data, your next step MUST be that follow-up tool call without asking permission first. Do not produce a final answer until it returns.
The `<query_execution>` block may include result values linked with `metabase://data-point` URLs. Whenever you mention a specific value from the updated chart, use the matching URL and choose natural link text for your answer.

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

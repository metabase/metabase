Edit the chart settings of an existing chart.
This tool changes the chart type (e.g., bar chart to line chart, table to pie chart) but does not modify the underlying data or SQL query.
It will return a new chart with the updated settings.

**Usage:**
- Use this tool when the user wants to change the chart settings of an existing visualization
- Use when converting between basic chart types (bar, line, pie, table, etc.)
- Only use when there is an existing chart that needs its settings changed

**When NOT to use:**
- Do not use for data analysis or querying - this tool only changes chart settings
- Do not use for detailed formatting (titles, colors, axes labels, styling)
- Do not use when the user needs to modify the underlying data or SQL query
- Do not use for creating new charts - only for editing existing ones
- Avoid when the user wants complex customizations beyond basic chart type changes
- Do not use when you don't have any chart in the conversation context, instead, state that you seem not to have access to the chart the user is referring to.

**Limitations:**
- Only changes the chart type, not detailed display settings
- Cannot modify chart titles, colors, axis formatting, or styling
- Does not modify data or perform calculations
- Limited to basic chart type conversions
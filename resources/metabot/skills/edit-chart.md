---
id: edit-chart
title: Editing chart settings
description: Changing the chart type of an existing visualization with edit_chart (e.g. bar to line) — load when the user wants to switch chart type for a chart already in context.
tools: [edit_chart]
priority: 50
---
Edit the chart settings of an existing chart.
This tool changes the chart type (e.g., bar chart to line chart, table to pie chart) but does not modify the underlying data or SQL query.
It will return a new chart with the updated settings.

**Usage:**
- Use this tool when the user wants to change the chart settings of an existing visualization
- Use when converting between basic chart types (bar, line, pie, table, etc.)
- Only use when there is an existing chart that needs its settings changed

**Arguments** — all four are required on every call:
- `chart_id` — the id of the chart in the conversation context you are editing
- `new_viz_settings.chart_type` — the chart type to switch to
- `title` — a short, human-friendly title, written like a saved-question name; it becomes the title shown above the returned chart
- `description` — a concise one- or two-sentence description of what the chart shows; it becomes the saved question's description

Because `title` and `description` are re-sent on every edit, carry the existing chart's wording over unless the user asked to change it — don't drop back to a placeholder.

**When NOT to use:**
- Do not use for data analysis or querying - this tool only changes chart settings
- Do not use for detailed formatting (colors, axis labels, number formatting, series styling)
- Do not use when the user needs to modify the underlying data or SQL query
- Do not use for creating new charts - only for editing existing ones
- Avoid when the user wants complex customizations beyond basic chart type changes
- Do not use when you don't have any chart in the conversation context, instead, state that you seem not to have access to the chart the user is referring to.

**Limitations:**
- `new_viz_settings` accepts `chart_type` and nothing else, so colors, axis labels, number formatting, goal lines, and series styling cannot be changed through this tool
- Does not modify data or perform calculations
- Limited to basic chart type conversions

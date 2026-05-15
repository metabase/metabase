---
title: Scatterplots and bubble charts
redirect_from:
  - /docs/latest/questions/sharing/visualizations/scatterplot-or-bubble-chart
---

# Scatterplots and bubble charts

Scatterplots and bubble charts visualize the relationship between numeric values. 

Scatterplots show two numeric values per data point, while bubble charts show three by using the size of each dot to represent a third value.

![Scatter](../images/scatter.png)

## Data shape for a scatterplot or bubble chart

To create a scatterplot, create a question that returns two numeric columns. For example, `Count of Orders` and `Average of Total` grouped by `Product ID`:

| Product ID | Count of orders | Average of total |
| ---------- | --------------- | ---------------- |
| 1          | 487             | 92.40            |
| 2          | 612             | 78.15            |
| 3          | 893             | 105.30           |
| 4          | 245             | 134.50           |
| 5          | 1,420           | 65.80            |

Each row in the result becomes a single dot on the chart, with the first numeric column on the x-axis and the second on the y-axis.

To create a bubble chart, include a third numeric column. In chart settings, select that column from the **Bubble size** menu. The third column value determines the size of each dot:

| Product ID | Count of orders | Average of total | Total revenue |
| ---------- | --------------- | ---------------- | ------------- |
| 1          | 487             | 92.40            | 45,000        |
| 2          | 612             | 78.15            | 47,800        |
| 3          | 893             | 105.30           | 94,000        |
| 4          | 245             | 134.50           | 33,000        |
| 5          | 1,420           | 65.80            | 93,400        |

You can also break out by a category to create a separate colored series for each value. For example, grouping by Product Category creates a series for each category (Gizmo, Doohickey, Gadget, and Widget in the example chart above).

## Scatterplot and bubble chart settings

To open chart settings, click the **Gear** icon in the bottom left of the visualization.

### Data

In chart settings, click the **Data** tab to configure which columns appear on the chart.

- **X-axis:** The column(s) to plot on the x-axis
- **Y-axis:** The column(s) to plot on the y-axis
- **Bubble size:** The column that determines the size of each dot (leave empty for a standard scatterplot)

### Display

In chart settings, click the **Display** tab to edit how the chart looks.

To add a goal line, enable the **Goal line** toggle. Use the **Goal value** and **Goal label** fields to set the value and label.

> You can't set [alerts](../alerts.md) on goal lines in scatterplots or bubble charts.

To stack series on top of each other, enable the **Stack series** toggle.

To show extra information when hovering over a dot, add columns to **Additional tooltip columns**.

### Axes

In chart settings, click the **Axes** tab to edit the chart axes.

#### X-axis

Use the following options for the x-axis:

- **Show label:** Enable the toggle to display the x-axis label.
- **Label:** Name the x-axis label.
- **Show lines and tick marks:** Select how to display the x-axis line, tick marks, and labels. Choose between **Hide**, **Show**, **Compact**, **Rotate 45°**, and **Rotate 90°**.
- **Scale:** Select how values are spaced along the x-axis. Choose between **Linear**, **Power**, **Log**, **Histogram**, and **Ordinal**.

#### Y-axis

Use the following options for the y-axis:

- **Show label:** Enable the toggle to display the y-axis label.
- **Label:** Name the y-axis label.
- **Split y-axis when necessary:** When enabled, Metabase displays separate y-axes for series with very different value ranges.
- **Auto y-axis range:** When enabled, Metabase sets the y-axis range automatically based on your data. When disabled, use the **Min** and **Max** fields to set custom values.
- **Unpin from zero:** When enabled, the y-axis can start at a value other than zero.
- **Scale:** Select how values are spaced along the y-axis. Choose between **Linear**, **Power**, and **Log**.
- **Show lines and tick marks:** Select how to display the y-axis line, tick marks, and labels. Choose between **Hide**, **Show**, **Compact**, **Rotate 45°**, and **Rotate 90°**.
- **Number of tick marks:** Set how many tick marks appear on the y-axis. Defaults to **auto**.

## Limitations and alternatives

- If you only have one numeric value to plot, or if you want to show how a value changes over time, consider a [bar chart, histogram, or line chart](./line-bar-and-area-charts.md) instead.
- Scatterplots can become hard to read with very large datasets because of overlapping dots. For large datasets, consider aggregating your data or using a [heat map](./pivot-table.md#using-pivot-tables-as-heatmaps) instead.
- You can't set [alerts](../alerts.md) on goal lines in scatterplots or bubble charts.


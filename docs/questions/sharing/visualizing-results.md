---
title: Visualizing data
redirect_from:
  - /docs/latest/users-guide/05-visualizing-results
---

# Visualizing data

While tables are useful for looking up information or finding specific numbers, it's usually easier to see trends and make sense of data using charts.

To change how the answer to your question is displayed, click on the **Visualization** button in the bottom-left of the screen to open the visualization sidebar.

![Visualization options](../images/VisualizeChoices.png)

If a particular visualization doesn’t really make sense for your answer, that option will appear in the "Other charts" section. You can still select one of these other charts, though you might need to fiddle with the chart options to make the chart work with your data.

Not sure which visualization type to use? Check out [Which chart should you use?](https://www.metabase.com/learn/visualization/chart-guide)

## Visualization options

![Options for a chart](../images/viz-options.png)

Each visualization type has its own advanced options.

To change the settings for a specific chart, for example a row chart, you could either:

- Click on the gear icon in the bottom left of the chart (next to the **Visualization** button, or
- Click on **Visualization** in the bottom left of the chart, then hover over the currently selected chart and click on the **gear** icon that pops up.

## Visualization types

Metabase ships with a bunch of different visualizations types:

## Numbers

The [Numbers](./visualizations/numbers.md) option is for displaying a single number, nice and big.

![Number](../images/number.png)

## Trends

The [Trend](./visualizations/trend.md) visualization is great for displaying how a single number has changed between two time periods.

![Trend settings](../images/trend-settings.png)

## Detail

The [Detail](./visualizations/detail.md) visualization shows a single result record (row) in an easy-to-read, two-column display.

![Detail of a record in the account table](../images/detail.png)

## Progress bars

[Progress bars](./visualizations/progress-bar.md) are for comparing a single number to a goal value that you set.

![Progress bar](../images/progress.png)

## Gauges

[Gauges](./visualizations/gauge.md) allow you to show a single number in the context of a set of colored ranges that you can specify.

![Gauge](../images/gauge.png)

## Tables

The [Table](./visualizations/table.md) option is good for looking at tabular data (duh), or for lists of things like users or orders.

![Conditional formatting](../images/conditional-formatting.png)

## Pivot tables

[Pivot tables](./visualizations/pivot-table.md) allow you swap rows and columns, group data, and include subtotals in your table. You can group one or more metrics by one or more dimensions.

![Pivot table options](../images/pivot-table-options.png)

## Line charts

[Line charts](./visualizations/line-bar-and-area-charts.md) are best for displaying the trend of a number over time, especially when you have lots of x-axis values. For more, check out our [Guide to line charts](https://www.metabase.com/learn/basics/visualizing-data/line-charts.html) and [Time series analysis](https://www.metabase.com/learn/time-series) tutorials.

![Trend lines](../images/trend-lines.png)

## Bar charts

[Bar charts](./visualizations/line-bar-and-area-charts.md) are great for displaying a number grouped by a category (e.g., the number of users you have by country).

![Bar chart](../images/bar.png)

## Area charts

[Area charts](./visualizations/line-bar-and-area-charts.md) are useful when comparing the proportions of two metrics over time. Both bar and area charts can be stacked.

![Stacked area chart](../images/area.png)

## Combo charts

[Combo charts](./visualizations/combo-chart.md) let you combine bars and lines (or areas) on the same chart.

![Line + bar](../images/combo-chart.png)

## Histograms

If you have a bar chart like Count of Users by Age, where the x-axis is a number, you'll get a special kind of bar chart called a [histogram](./visualizations/line-bar-and-area-charts.md) where each bar represents a range of values (called a "bin").

![Histogram](../images/histogram.png)

## Row charts

[Row charts](./visualizations/line-bar-and-area-charts.md) are good for visualizing data grouped by a column that has a lot of possible values, like a Vendor or Product Title field.

![Row chart](../images/row.png)

## Waterfall charts

[Waterfall charts](./visualizations/waterfall-chart.md) are a kind of bar chart useful for visualizing results that contain both positive and negative values.

![Waterfall chart](../images/waterfall-chart.png)

## Scatterplots and bubble charts

[Scatterplots](./visualizations/scatterplot-or-bubble-chart.md) are useful for visualizing the correlation between two variables, like comparing the age of your people using your app vs. how many dollars they've spent on your products.

![Scatter](../images/scatter.png)

## Pie chart or donut charts

A [pie chart or donut chart](./visualizations/pie-or-donut-chart.md) can be used when breaking out a metric by a single dimension, especially when the number of possible breakouts is small, like users by gender.

![Donut](../images/donut.png)

## Funnel charts

[Funnels](./visualizations/funnel.md) are commonly used in e-commerce or sales to visualize how many customers are present within each step of a checkout flow or sales cycle. At their most general, funnels show you values broken out by steps, and the percent decrease between each successive step.

![Funnel](../images/funnel.png)

## Maps

When you select the [Map](./visualizations/map.md) visualization, Metabase will automatically try and pick the best kind of map to use based on the table or result set.

![Region map](../images/map.png)

## Formatting data in charts

While we're talking about formatting, we thought you should also know that you can access formatting options for the columns used in a chart. Just open the visualization settings and select the `Data` tab:

![Chart formatting](../images/chart-formatting.png)

Then click on the gear icon next to the column that you want to format. Dates, numbers, and currencies tend to have the most useful formatting options.

![Chart formatting options](../images/chart-formatting-options.png)

## Further reading

- [Charts with multiple series](../../dashboards/multiple-series.md)
- [Appearance](../../configuring-metabase/appearance.md)
- [BI dashboard best practices](https://www.metabase.com/learn/dashboards/bi-dashboard-best-practices.html)

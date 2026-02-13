---
title: Visualization overview
redirect_from:
  - /docs/latest/users-guide/05-visualizing-results
  - /docs/latest/questions/sharing/visualizing-results
  - /docs/latest/questions/visualizations
---

# Visualization overview

While tables are useful for looking up information or finding specific numbers, it's usually easier to see trends and make sense of data using charts.

## Visualize query results

The query builder will automatically select an appropriate chart to visual your results. With native queries, however, you'll need to manually select a chart type.

### Visualizing questions in the query builder

To visualize results of a question built in the [query builder](../query-builder/editor.md), click on the **Visualize** button under the last query builder step. Metabase will select a chart type most appropriate for your data, but you can [change the visualization type](#change-visualization-type). You can also toggle between the visualization and the table of results.

You can switch between the visualization view and the query builder using the **Visualization**/**Editor** button in the top right.

![Switch to editor](../images/switch-to-editor.png)

### Visualizing native questions

To visualize results of a native query, click on the **Visualization** button in the bottom of the screen and select a visualization type.

![Visualize a native query](../images/visualize-native.png)

As long as the shape of the native query results is appropriate for the chart type - for example, a metric grouped by a date column for a trend chart - you'll be able to use all chart types, except [pivot tables](./pivot-table.md). [Pivot tables](./pivot-table.md) are currently unavailable for native queries.

## Change visualization type

To change how the answer to your question is displayed, click on the **Visualization** button in the bottom-left of the screen to open the visualization sidebar.

![Visualization options](../images/VisualizeChoices.png)

If a particular visualization doesn't make sense for your answer, that option will appear in the "More charts" section. You can still select one of these other charts, though you might need to fiddle with the chart options to make the chart work with your data.

Not sure which visualization type to use? Check out [Which chart should you use?](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/chart-guide)

## Visualization options

![Options for a chart](../images/viz-options.png)

Each visualization type has its own advanced options. To change the settings for a specific chart, for example a row chart, click on the **Gear** button in the bottom left.

## Area charts

[Area charts](./line-bar-and-area-charts.md) are useful when comparing the proportions of two metrics over time. Both bar and area charts can be stacked.

![Stacked area chart](../images/area.png)

## Bar charts

[Bar charts](./line-bar-and-area-charts.md) are great for displaying a number grouped by a category (e.g., the number of users you have by country).

![Bar chart](../images/bar.png)

## Combo charts

[Combo charts](./combo-chart.md) let you combine bars and lines (or areas) on the same chart.

![Line + bar](../images/combo-chart.png)

## Detail

The [Detail](./detail.md) visualization shows a single result record (row) in an easy-to-read, two-column display.

![Detail of a record in the account table](../images/detail.png)

## Funnel charts

[Funnels](./funnel.md) are commonly used in e-commerce or sales to visualize how many customers are present within each step of a checkout flow or sales cycle. At their most general, funnels show you values broken out by steps, and the percent decrease between each successive step.

![Funnel](../images/funnel.png)

## Gauges

[Gauges](./gauge.md) allow you to show a single number in the context of a set of colored ranges that you can specify.

![Gauge](../images/gauge.png)

## Line charts

[Line charts](./line-bar-and-area-charts.md) are best for displaying the trend of a number over time, especially when you have lots of x-axis values. For more, check out our [Guide to line charts](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/line-charts) and [Time series analysis](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/time-series) tutorials.

![Trend lines](../images/trend-lines.png)

## Maps

When you select the [Map](./map.md) visualization, Metabase will automatically try and pick the best kind of map to use based on the table or result set.

![Region map](../images/map.png)

## Numbers

The [Numbers](./numbers.md) option is for displaying a single number, nice and big.

![Number](../images/number.png)

## Pie, donut, and sunburst charts

A [pie chart or donut chart](./pie-or-donut-chart.md) can be used when breaking out a metric by a single dimension, especially when the number of possible breakouts is small, like accounts by plan.

A [sunburst chart](./pie-or-donut-chart.md) is a pie chart with more than one ring to show the data broken out by additional dimensions.

![Donut](../images/pie-sunburst-demo.png)

## Pivot tables

[Pivot tables](./pivot-table.md) allow you swap rows and columns, group data, and include subtotals in your table. You can group one or more metrics by one or more dimensions.

![Pivot table options](../images/pivot-table-options.png)

## Progress bars

[Progress bars](./progress-bar.md) are for comparing a single number to a goal value that you set.

![Progress bar](../images/progress.png)

## Row charts

[Row charts](./line-bar-and-area-charts.md) are good for visualizing data grouped by a column that has a lot of possible values, like a Vendor or Product Title field.

![Row chart](../images/row.png)

## Tables

The [Table](./table.md) option is good for looking at tabular data (duh), or for lists of things like users or orders.

![Conditional formatting](../images/conditional-formatting.png)

## Trends

The [Trend](./trend.md) visualization is great for displaying how a single number has changed between two time periods.

![Trend settings](../images/trend-settings.png)

## Histograms

If you have a bar chart like Count of Users by Age, where the x-axis is a number, you'll get a special kind of bar chart called a [histogram](./line-bar-and-area-charts.md) where each bar represents a range of values (called a "bin").

![Histogram](../images/histogram.png)

## Sankey charts

[Sankey charts](./sankey.md) show how data flows through multi-dimensional steps.

![Left-aligned sankey chart](../images/sankey-left-aligned.png)

## Waterfall charts

[Waterfall charts](./waterfall-chart.md) are a kind of bar chart useful for visualizing results that contain both positive and negative values.

![Waterfall chart](../images/waterfall-chart.png)

## Scatterplots and bubble charts

[Scatterplots](./scatterplot-or-bubble-chart.md) are useful for visualizing the correlation between two variables, like comparing the age of your people using your app vs. how many dollars they've spent on your products.

![Scatter](../images/scatter.png)

## Styling and formatting data in charts

![Chart formatting options](../images/chart-formatting-options.png)

You can access formatting options for the columns used in a chart. Just open the visualization settings by clicking on the **Gear** icon in bottom left.

Options differ depending on the chart, and can include settings for the chart's data, its display, and its axes.

See also [Formatting defaults](../../data-modeling/formatting.md).

## Further reading

- [Charts with multiple series](../../dashboards/multiple-series.md)
- [Appearance](../../configuring-metabase/appearance.md)
- [BI dashboard best practices](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/dashboards/bi-dashboard-best-practices.html)

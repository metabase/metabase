---
title: Metrics explorer
summary: Explore metrics and measures across dimensions and compare them side by side.
---

# Metrics explorer

Metrics Explorer is a space for ad-hoc analysis of [metrics](../data-modeling/metrics.md) and [measures](../data-studio/data-structure.md#measures)

![Metrics explorer](../questions/images/metrics-explorer.png)

Metrics explorer can help you visualize trends and breakdowns of different metrics and measures - including metrics and measures built on different data sources - in one place. For example, you might want to see how the revenue trend compares to changes in customer sentiment for different products.

Metrics explorer is where you can:

- Visualize multiple metrics and measures on one chart
- Compare metrics and measures along shared dimensions
- Break out by additional dimensions
- Filter each metric or measure
- Zoom into time periods

## Explore a metric or a measure

To open a **metric** in the Metrics Explorer:

1. Open the metric.
2. Click **Explore** in thw top right corner to op

To get back to the metric's page from metrics explorer, right-click the metric card in the search bar and select **Go to metric home page**.

To open a **measure** in the Metrics Explorer, go directly to `[your metabase URL]/explore` and type the measure's name in the search bar. To get back to the measure definition from metrics explorer, right-click the measure card in the search bar and select **Edit in Data Studio**.

## Compare metrics and measures

You can explore multiple metrics or measures to analyze them together. To add a metric or a measure for comparison, type its name in the search bar:

![Compare metrics](./images/compare-metrics.png)

You'll see the dimensions of the first metric/measure below the search bar. You can pick a dimension to break out the metrics/measures (for example, if you want to see how both Number of Orders and Revenue change by date, state, or product category).

![Compare metrics](./images/two-metrics.png)

When two measures/metrics have shared dimensions - usually when they're associated with the same data source, or the underlying data sources have foreign key relationships to another shared data source - Metabase will automatically detect shared dimensions and offer them for comparison.

If your metrics/measures don't have shared dimensions, you'll need to proactively tell Metabase which dimensions you want to select for comparison:

1. Click on the **+** under the search bar to select a dimension for the first metric/measure.

   ![Pick first dimension](./images/pick-first-dimension.png)

2. At the bottom of the screen, select compatible dimensions for other metrics/measures.

   ![Pick second dimension](./images/pick-second-dimension.png)

When your metrics/measures don't have shared dimensions, Metabase has no way of knowing how the dimensions relate to each other, so it's on you to make sure the dimensions you pick make sense to compare!

## Break out by dimensions

You can also break out each metric by additional dimensions in the metrics explorer. For example, you might want to compare overall revenue trend to number of orders for each product category separately.

To break out a metric or measure by additional dimension:

1. Right-click on the metric's card in the search bar.
2. Select **Break out**
   ![Break out by](./images/break-out-metric.png)
3. Choose the breakout dimension.

![Break out](./images/breakout-chart-explorer.png)

To remove the breakout, right-click on the measure/metric card again and select **Remove breakout**

## Filter metrics and measures

You can add filters to each metric/measure in the metrics explorer. For example, you might want to compare overall revenue trend to number of orders for one specific product category.

To add a filter to a metric or measure:

1. Click the **filter** icon in the top right corner of the metrics explorer.
2. Select the metric/easure you want to filter.
3. Select the field to filter and define the filter.

You'll see the filter added below the metric or measure's card in the search bar. To remove the filter, click the **X** on the filter's card.

![Filtered metric](./images/filtered-metric.png)

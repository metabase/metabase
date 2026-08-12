---
title: Metric dimensions
summary: Choose the dimensions people can use to break out and filter a metric, and set the default dimension Metabase uses to display the metric.
---

# Metric dimensions

Metric dimensions are the fields people can use to break out and filter a metric, like grouping revenue by month or by product category.

![Dimensions tab](./images/metric-dimensions.png)

By default, every column from a metric's source data serves as a dimension. You can curate a metric's dimensions to control which fields appear as breakout and filter options. You can also set the default dimension Metabase uses to display the metric.

Curated dimensions apply everywhere the metric appears:

- The [Metrics explorer](../questions/metrics-explorer.md) lists curated dimensions as breakout options.
- The metric's **About** tab displays the metric grouped by its default dimension, and people can switch to any other curated dimension.
- Dashboard cards display the metric grouped by its default dimension.
- Dashboard filters can connect to the metric's curated dimensions.

Curated dimensions don't affect the [query builder](../questions/query-builder/editor.md)'s filter and summarize pickers. When someone uses a metric in a question, they can filter and summarize by any column from the metric's source data.

## Curate a metric's dimensions

To curate a metric's dimensions:

1. Visit the metric and open the **Dimensions** tab.
2. Click **Available dimensions**. Metabase lists the fields from the metric's source table, plus fields from joined tables and tables related by foreign keys.
3. Select the fields to add as dimensions.
4. Click **Done**.

To remove dimensions from the curated list, select the checkbox next to each dimension, then click the trash icon. Removing a dimension disconnects any dashboard filters that use it.

### Dimensions from related tables

If the metric's source table has foreign keys, the **Available dimensions** list also includes fields from the related tables.

Metabase groups these fields under the name of the foreign key column, not the name of the related table. For example, if an `Orders` table has a `User ID` column pointing to a `People` table, the `People` fields appear in a group named **User**.

If a table links to the same related table through two different columns, Metabase creates groups named after each column. For example, if both a `Reporter ID` and an `Assignee ID` column point to a `Users` table, the `Users` fields appear under two groups: **Reporter** and **Assignee**.

### Rename a dimension

To rename a dimension:

1. On the **Dimensions** tab, click the dimension.
2. In the **Display name** field, enter a new name.

Dimension names are specific to the metric. Renaming a dimension doesn't affect the underlying field or other metrics that use the same field.

Dimensions from related tables get a default name that combines the [group name](#dimensions-from-related-tables) and the field name, like `Product - Category`.

### Reorder dimensions

To change a dimension's position in the list, drag the dimension by its handle. Metabase lists dimensions in this order everywhere the metric appears.

## Set a default dimension

A metric's default dimension determines how Metabase displays the metric when people view it without choosing a breakout.

To set a default dimension:

1. On the **Dimensions** tab, click the dimension.
2. Click **Set as default**.

You can choose any curated dimension as the default. If you don't choose a default dimension, the metric displays as a single number.

To remove the default, click the dimension, then click **Remove default**.

The default dimension only affects display. It doesn't change how the metric is computed, and people can break out the metric by any other curated dimension.

### Set a time grouping

To set a default time grouping for a time dimension:

1. On the **Dimensions** tab, click the time dimension.
2. Click **Select a time grouping** and choose a grouping from the dropdown.

Metabase uses the default time grouping whenever the metric is broken out by that time dimension.

Setting a default time grouping doesn't lock the metric to it. People can still group the metric by other granularities.

## Dimensions in the Metrics explorer

When you view a single metric in the [Metrics explorer](../questions/metrics-explorer.md), the **Break out** panel lists the metric's curated dimensions. The panel excludes primary key and foreign key dimensions, which are still available to [dashboard filters](#dashboard-cards-and-filters).

### Shared dimensions across metrics

When you view multiple metrics in the Metrics explorer, the **Break out** panel lists the curated dimensions shared by all the metrics. Each breakout applies to every metric at once.

Time dimensions are grouped in a single **Time** option. Any other column appears in the shared list only if it's a dimension of every selected metric.

To break out by a curated dimension that only some of the selected metrics share, click **See all**.

For more information on how the Metrics explorer matches dimensions, see [Compare metrics and measures](../questions/metrics-explorer.md#compare-metrics-and-measures).

## Dashboard cards and filters

When you add a metric to a dashboard, the card displays the metric grouped by its default dimension. A metric without a default dimension displays as a single number.

A dashboard filter can connect to any of the metric's curated dimensions that match the filter's type. If none of the metric's curated dimensions match the filter's type, the card shows **No valid fields**.

## Metrics upgraded from earlier versions

When you upgrade to Metabase 64, existing metrics keep every column from the source table and any joined tables as dimensions. This preserves dashboards and filters that depend on those columns.

A metric's default time dimension becomes its default dimension, with the same time grouping. Metrics without a default time dimension continue to display as a single number.

If an upgraded metric has several dimensions with the same field name, Metabase adds the table or column name. For example, the `ID` columns from related tables appear as `User - ID` and `Product - ID`.

## Further reading

- [Metrics](metrics.md)
- [Metrics explorer](../questions/metrics-explorer.md)
- [Dashboard filters](../dashboards/filters.md)
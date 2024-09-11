---
title: Metrics
redirect_from:
  - /docs/latest/administration-guide/07-segments-and-metrics
  - /docs/latest/data-modeling/segments-and-metrics
---

# Metrics

Create metrics to define the official way to calculate important numbers for your team.

Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data

For example, you may want to create a metric that calculates revenue, so people can refer to revenue in their own questions, or add the metric to a dashboard.

## Using metrics

You can:

- Save metrics to [collections](../exploration-and-organization/collections.md).
- Add metrics to [dashboards](../dashboards/introduction.md).
- View metrics in the [data browser](../exploration-and-organization/exploration.md#browse-your-data).
- Refer to them in questions.

### Metrics in the query builder

When asking questions in the query builder, you can find metrics your team created in the summarization section under **Common metrics**.

## Creating a metric

You can create a metric by clicking on the **+ New** menu and selecting **Metric**.

Select your starting data. You can start from a model, metric, table, or saved question.

You can only use the query builder to define a metric.

The metric editor is similar to the regular query builder, with a few key differences:

- The aggregation section is called [**Formula**](#metric-formula)
- The group by section is called the [**Default time dimension**](#metric-default-time-dimension), and this section only allows you to group by a single time dimension.

TODO insert images

Only the data and formula steps are required to define a metric. You can join and filter data before the formula step, and set a default time dimension to group by. People can then use these metrics when asking their own questions (instead of, say, calculating revenue five different ways in five different places).

## Metric formula

The formula is the core of the metric. It's the thing you are aggregating, and it's required when defining a metric.

## Metric default time dimension

You can optionally set a default time dimension for the metric. Metabase will use this default time dimension only when displaying the metric on a card in a collection or dashboard.

Setting a time dimension doesn't lock the metric to that specific dimension. If someone uses the metric in a question or dashboard, they'll be able to group by other time dimensions and granularities as well.

For example, you could calculate revenue and set a default time dimension of `Created At` by month, but if someone added that metric to a dashboard, they could group revenue by a different time granularity (e.g., by quarter). This is just an FYI so that you don't name a metric "Monthly Revenue" and think that by setting a default time dimension to "month", Metabase will prevent people from slicing revenue by other time granularities.

## Editing a metric

To edit a metric, click on the three dot menu (**...**) and select **Edit metric definition**.

Do your thing, and save your changes.

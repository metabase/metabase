---
title: Funnel charts
redirect_from:
  - /docs/latest/questions/sharing/visualizations/funnel
  - /learn/visualization/funnel
  - /docs/latest/questions/visualizations/funnel
  - /learn/metabase-basics/querying-and-dashboards/visualization/funnel

description: Funnel charts visualize how a value is broken out by a series of steps, and the percent change between steps. To build a funnel chart in Metabase, you need a table with the name and value for each stage.
---

# Funnel charts

Funnel charts visualize how a value is broken out by a series of steps, and the percent change between steps.

![Funnel](../images/funnel.png)

Funnels are commonly used in e-commerce or sales to visualize how many customers are present within each step of a checkout flow or sales cycle.

## Data shape for a funnel chart

To create a funnel in Metabase, you'll need to have a table with at least two columns: one column that contains the funnel's steps, and another column contains the metric you're interested in, like the number of customers at this stage.

Here's the data shape used to create the chart above:

| Step          | Opportunities |
| ------------- | ------------- |
| Leads         | 3901          |
| Qualification | 3714          |
| Prospecting   | 3231          |
| Proposal      | 2972          |
| Negotiation   | 1588          |
| Closed        | 737           |

If you have more columns in your query results, you can select which columns should be used for the funnel steps and the metric in the [data settings](#funnel-chart-settings).

By default, Metabase will present steps in the same order as they appear in the query result, but you can reorder or hide the steps in the [data settings](#funnel-chart-settings).

## Build a query for a funnel chart

To create a query with a result that has the shape required for a funnel chart, you'll probably need to summarize your data.

If your (original, unaggregated) data already contains a field with the the step for every data point, you can build a simple query with a breakout by steps:

![A query in the query builder used to build a funnel chart](../images/build-a-funnel-query.png)

If data for the different stages of the funnel comes from different tables, or if you need to use different filters or aggregation rules for each stage, you can create separate questions for each stage, and then combine them with a SQL query.

For example: you could create three separate [query builder](../query-builder/editor.md) questions, each returning the counts for `Leads`, `Qualification`, and `Proposal` stages. Then you'd write a [SQL query](../native-editor/writing-sql.md) that [references those questions](../native-editor/referencing-saved-questions-in-queries.md) and uses `UNION` to return results in the right shape to build a funnel chart.

```sql
-- example of a query that retrieves results of questions and combines them with UNION

SELECT 'Leads' as stage, * from {{#120-leads}}
UNION
SELECT 'Qualified' as stage, * from {{#121-qualified}}
UNION
SELECT 'Prospects' as stage, * from {{#122-prospects}}

```

![Data for the funnel coming from a SQL union](../images/funnel-as-sql.png)

## How to read a funnel chart

Funnel charts show the value of the metric for each stage, and how the metric compares to the value at the _first_ stage. The first stage's metric is displayed to the left of the chart.

![Funnel chart with a tooltip](../images/read-a-funnel.png)

So for example,"76.19\%, 2,972" under a step means that the value of the metric at this step is 2,972, which is 76.19\% of the value of the _first_ step (equal to 3,901).

To see percentage comparison with the _previous_ step (instead of the first), hover over the step and read the tooltip.

## Funnel chart settings

To open chart settings, click on the **Gear** icon in the bottom left.

![Funnel chart settings](../images/funnel-settings.png)

If you have more than two columns in your query results, you can select which columns should be used for the funnel steps and the measure in the **Data** tab.

You can reorder funnel stages by dragging and dropping, or hide a stage by clicking on the **Eye** icon on the stage card.

To edit the formatting of the metric, click on **Three dots** next to the metric. The formatting will only apply to the _metric itself_, but _not_ to the percentage values that compare each stage's metric to the first stage (which currently you can't format).

## Limitations and alternatives

Currently, you can't change the color or orientation of the funnel, or add breakouts. Consider using a [bar or row chart](./line-bar-and-area-charts.md) for more flexible visualization options.

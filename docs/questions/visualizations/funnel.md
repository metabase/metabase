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

But often the data for the different stages of the funnel comes from different tables, or you might need to use different filters or aggregation rules for each step. In this case, you can create separate questions for each step, and then use SQL to combine them.

For example, you can create 3 separate [query builder](../query-builder/editor.md) questions, each returning the counts for `Leads`, `Qualification`, and `Proposal` stages. Then you can write a [SQL query](../native-editor/writing-sql.md) that [references those questions](../native-editor/referencing-saved-questions-in-queries.md) and uses `UNION` to combine the results into a single table with the funnel-appropriate shape

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

Funnel charts in Metabase show the value of the metric for each step, and how the metric at this step compares to the value at the _first_ step. The metric on the first step is displayed to the left of the chart.

![Funnel chart with a tooltip](../images/read-a-funnel.png)

So for example,"76.19\%, 2,972" under a step means that the value of the metric at this step is 2,972, which is 76.19\% of the value of the _first_ step (equal to 3,901).

To see percentage comparison with the _previous_ step (instead of the first), hover over the step and read the tooltip.

## Funnel chart settings

To open chart settings, click on the **Gear** icon in the bottom left.

![Funnel chart settings](../images/funnel-settings.png)

If you have more than two columns in your query results, you can select which columns should be used for the funnel steps and the measure in the **Data** tab.

You can reorder funnel steps by dragging the cards with steps, or hide the step by clicking on the **Eye** icon on the step card.

To edit the formatting of the measure, click on **Three dots** next to the measure name. The formatting will only apply to the _metric itself_, but not to the percentage values. In particular, selecting “Style: Percent” in the measure format options will only change how Metabase formats the metric - for example, `17` will be formatted as `1700%`.

## Limitations and alternatives

Currently, you can't change the color or orientation of the funnel, or add breakouts. Consider using a [bar or row chart](./line-bar-and-area-charts.md) for more flexible visualization options.

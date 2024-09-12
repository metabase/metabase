---
title: Progress bars
---

# Progress bars

**Progress bars** are for comparing a single number to a goal value that you set.

![Progress bar](../../images/progress.png)

## When to use the progress bar

Progress bar is useful when you want to communicate, well, progress of a metric towards a goal, like assessing performance on
on KPI metrics or tracking percent completion or tracking percent percent completion of a project.

Progress bars give you an option to set up an alert whenever the result of a question reaches the goal set in the progress bar settings. See [Progress bar alerts](../alerts.md#progress-bar-alerts).

## How to build a progress bar

To create a progress bar you'll need:

- A query that returns a single number, like "Sum of order quantity". Progress bar doesn't work with breakouts.

- A goal value. The goal value should be a positive number. Currently, Metabase only supports setting a static goal (you can't set a goal based on another query).

  The goal is set in the [chart options](#progress-bar-options).

![Progress bar KPI](../../images/progress-bar-elements.png)

## Progress bar options

To open the chart options, click on the gear icon at the bottom left of the screen.

Format options will apply to both the result of the query and the goal value:

![Progress bar with format applied](../../images/progress-with-format.png)

Note that selecting "**Style**: Percent" in format options will only change how the result of the query is formatted: for example, `17` will be formatted as `1700%`. It will not make Metabase display the query result as % of the **Goal**. If that's what you want, you'll need to build that computation into your query: for example, to display count of orders as % of the goal of `20`, use [custom expressions](../../query-builder/expressions.md) to return "Count of orders divided by 20", and format the result as a percentage.

## Limitations and alternatives

- Progress bar assumes that your objective is to increase a metric. It might not be appropriate for use cases where the objective is to reduce a metric (for example, number of unanswered support tickets). Consider using the [gauge chart](gauge.md) for those use cases.

- Progress bars do not support breakouts. If you'd like to display progress of a metric towards a goal across a breakout, consider using a [bar or line chart with a goal line](line-bar-and-area-charts.md#goal-lines).

## See also

- [Gauge charts](./gauge.md)
- [Goal lines on bar and line charts](./line-bar-and-area-charts.md#goal-lines)
- Tutorial: [Which chart should I use?](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/chart-guide)

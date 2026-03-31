---
title: Metrics explorer
summary: Explore metrics and measures across dimensions, compare them side by side, and drill into the data — without building a question from scratch.
---

# Metrics explorer

DON'T READ ME YET I'M CLAUDE-GENERATED

The Metrics Explorer is a space for ad-hoc analysis of [metrics](../data-modeling/metrics.md) and [measures](../data-studio/data-structure.md#measures) without building a question from scratch. You can show one or more metrics or measures, slice them by different dimensions, filter the data, and compare trends side by side.

To open the Metrics Explorer, click **Explore** from any metric. You can also go directly to `/explore`.

## Compare metrics and measures

Add multiple metrics or measures to analyze them together. When the chart type supports it (like a line chart), Metabase overlays them so you can compare trends directly. For chart types that can only show one value at a time, Metabase displays each metric separately.

Metrics live in collections and are created in the metric editor; [measures](../data-studio/data-structure.md#measures) are saved aggregations defined on a table in Data Structure. The Metrics Explorer works with both.

## Break out by dimension

Breakouts are specific to each metric or measure. This means you can choose to break out "Revenue" by
View a metric or measure broken out by any of its available dimensions — by time, by category, by geography, and so on. You can have multiple breakdowns open at once and switch between them.

## Filter the data

Narrow the analysis by adding filters. Filters apply across the current view and stack if you add more than one.

## Drill into a time series

From a time series chart, drill down to a finer granularity (for example, from months to weeks), or drag across the chart to zoom into a specific time range.

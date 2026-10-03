---
title: Research
summary: Research automatically creates and ranks many charts using your metrics and dimensions, so you can use prompts to explore broad questions about your data.
---

# Research

Research lets you write prompts that automatically create many charts using your metrics and dimensions. Describe what you want to investigate, and Metabase assembles the relevant chart breakdowns, scores them for interestingness, and presents them in a single grouped view. Use Research to ask broad questions about your data without building charts one at a time.

## Before you start

Before you use Research, an admin must configure an AI provider in [AI settings](./settings.md).

Without a connected provider, you can still use Research to build a data set manually, but you can't use AI to rank charts.

## Create and run a Research plan

To create a Research plan, you can use a prompt or manually build the plan.

### Start from a prompt

1. Click **+ New > Research**, or press `Cmd+K` to open the command palette and select **New Research**.
2. Write a prompt, like "help me understand revenue, orders, and product ratings."
3. Click **Create plan**.
4. Review your **Research plan**. Metabase adds relevant metrics with their related dimensions, and pulls in any relevant timelines.
5. To refine your plan, send another prompt. To edit the plan yourself, use **+ Metrics** to add metrics, or **+ Events** to add timelines.
6. Enable the **Use AI to analyze and order results** toggle to rank charts, which consumes tokens. Disable the toggle to use a deterministic score.
7. Click **Start research**. Metabase generates the charts in the background, so you can browse the ones that are ready while the rest generate.

### Build the plan yourself

1. Click **Manual setup**.
2. Click **+ Metrics** to add metrics.
3. Click **+ Events** to add timelines.
4. Click **Start research**.

## Explore the results

In the sidebar, use the **All**, **Stars**, and **Discussions** tabs to view all charts, starred charts, and charts with comments.

From the filter menu, sort the charts by **Interestingness** or **Alphabetical**. Choose **Show hidden items** to reveal your hidden charts.

Act on the selected chart using the toolbar or your keyboard:

- **Star** (`S`)
- **Comment** (`C`)
- **Add to Summary**
- **Copy link**, from the **...** menu
- **Hide**, from the **...** menu

Use the left and right arrows to move between charts.

### Add charts to the Summary

Use the **Summary** to collect the most important charts in a single document at the top of the sidebar. To add the selected chart, click **Add to Summary** in the toolbar. The chart keeps the timeline you have selected. Comments are shared between the Research and the Summary.

### Explore a data point

Select a data point on a chart to open its menu:

- Click **Explore further** to investigate the value. Metabase creates a chart filtered to that value and adds it to your Research.
- Click **Add comment** to comment on the data point.

## Save and share your Research

Metabase saves each Research as an entity in your personal collection. Pin, bookmark, and move the Research like any other entity. To share a Research, move it into a collection that others can access.

Data permissions are enforced on the cached results. A viewer who lacks access to the underlying data source can't see those results, and a viewer with row-level security sees only the rows they're allowed to.

## Limitations

- After you start a Research, you can't add metrics, dimensions, or timelines to it, or change the prompt.
- You can't use metrics from a database that has [database routing](../permissions/database-routing.md) enabled.
---
title: Troubleshooting question and dashboard visualizations
summary: Fix charts and dashboard cards that don't look or behave the way you set them up.
---

# Troubleshooting question and dashboard visualizations

To start, check if your current browser settings are compatible with Metabase:

1. Clear your browser cache, and refresh your page.
2. Disable all extensions and plugins. Load the page again.
3. Give it one last shot---try opening your page in a private/incognito session, or a different browser.

## Formatting dashboard cards

1. Make sure that you're making and saving changes from the [card's settings](../dashboards/introduction.md#changing-a-cards-visualization-settings) (_not_ the original question's settings).
2. [Reset your card's visualization settings](../dashboards/introduction.md#resetting-a-cards-visualization-settings).

**Explanation**

A dashboard card uses the visualization settings of the original question, plus any settings that you change on the card. When you change a setting on the card, the card's setting overrides the question's setting for that card only. The question's other settings still apply to the card.

## Changes to a question don't show up on a dashboard card

Pick one of these fixes:

- **To match the question once**: [reset the card's visualization settings](../dashboards/introduction.md#resetting-a-cards-visualization-settings). The card gets a copy of the question's current visualization settings, and keeps its click behavior. Because the card now has its own copy of those settings, later changes to the same settings on the question won't show up on the card.
- **To keep following the question**: [replace the card](../dashboards/introduction.md#moving-cards-around) with the same question. The new card has no settings of its own, so it uses the question's visualization settings, including later changes. Replacing a card also clears its click behavior and its filter connections, so you'll need to set those up again.

**Explanation**

When you change a visualization setting on a question, the dashboard card shows the change, unless the card has its own value for the same setting. A card's own settings win over the question's settings, and Metabase doesn't show which settings a card overrides.

For example, say you change the color of a series on a dashboard card, and later change the color of the same series on the question. The card keeps the color that you picked on the dashboard. But if you add a goal line to the question (and didn't change the goal line on the card), the card shows the goal line.

## Visualizing SQL questions

Go to your SQL question and [change the visualization type](../questions/visualizations/visualizing-results.md) to a table. Then, check if any of the following situations apply to the raw query results:

- [Aggregations (counts, sums, etc.) are wrong](https://www.metabase.com/learn/sql/debugging-sql/sql-logic#aggregated-results-counts-sums-etc-are-wrong).
- [Results have duplicated rows](https://www.metabase.com/learn/sql/debugging-sql/sql-logic-duplicated-data).
- [Results are missing rows](https://www.metabase.com/learn/sql/debugging-sql/sql-logic-missing-data).

**Explanation**

If your question or dashboard card is powered by a handwritten [SQL query](../questions/native-editor/writing-sql.md) rather than the [query builder](../questions/query-builder/editor.md), your visualization is going to be more sensitive to changes in the underlying data (for example, renamed fields, or the sudden appearance of a wild null value). To learn more, read about [Common reasons for unexpected query results](https://www.metabase.com/learn/sql/debugging-sql/sql-logic#common-reasons-for-unexpected-query-results).

If you're having problems with things like SQL syntax errors or [SQL variables](https://www.metabase.com/glossary/variable#example-variable-in-metabase), see [Troubleshooting SQL questions](./sql.md) for more help.

## Related problems

- [My dates and times are wrong](./timezones.md).
- [My dashboard is slow or failing to load](./my-dashboard-is-slow.md).
- [I can't view or edit my question or dashboard](./cant-view-or-edit.md).
- [I can't see my tables](./cant-see-tables.md).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).

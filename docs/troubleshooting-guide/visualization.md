---
title: Troubleshooting question and dashboard visualizations
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

The visualization settings on a card are independent of the settings on the original question. When you first create a question, your selected visualization type is saved along with the query. When you add that question to a dashboard, the dashboard will display the same visualization as the original question by default. You can override the original visualization type by using the [card's visualization settings](../dashboards/introduction.md#changing-a-cards-visualization-settings).

## Visualizing SQL questions

Go to your SQL question and [change the visualization type](../questions/sharing/visualizing-results.md) to a table. Then, check if any of the following situations apply to the raw query results:

- [Aggregations (counts, sums, etc.) are wrong](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-logic#aggregated-results-counts-sums-etc-are-wrong).
- [Results have duplicated rows](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-logic-duplicated-data).
- [Results are missing rows](https://www.metabase.com/learn/debugging-sql/sql-logic-missing-data).

**Explanation**

If your question or dashboard card is powered by a handwritten [SQL query](../questions/native-editor/writing-sql.md) rather than the [query builder](../questions/query-builder/introduction.md), your visualization is going to be more sensitive to changes in the underlying data (for example, renamed fields, or the sudden appearance of a wild null value). To learn more, read about [Common reasons for unexpected query results](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-logic#common-reasons-for-unexpected-query-results).

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

---
title: My dashboard is slow
---

# My dashboard is slow

First, you'll want to make sure your browser is on friendly terms with Metabase:

- Clear your browser cache and disable all extensions before refreshing the page, or
- Try loading the dashboard in a private/incognito session.

## Dashboard has over 10 cards

1. Create a new dashboard for each group of cards that are related to the same time period or segment.
   - For example, create new dashboards for weekly vs. monthly metrics, or new vs. returning customers.
2. Move your cards to the new dashboard(s) until each dashboard has 10 or fewer cards.
3. Use [custom destinations](https://www.metabase.com/learn/dashboards/custom-destinations) to link related cards on different dashboards.

**Explanation**

A dashboard with 50 cards is almost always going to be slower than 5 dashboards with 10 cards. Metabase displays a dashboard by refreshing all of the questions on it (that is, re-executing all of the queries against your database). Your data warehouse may try to run these queries at the same time to return the results faster, however, these queries can actually compete with each other and slow things down (like having too many programs open on your computer at once).

Aside from running faster, a small and focused dashboard is also easier for people to understand without getting overwhelmed. For more tips, check out our article on [BI dashboard best practices](https://www.metabase.com/learn/dashboards/bi-dashboard-best-practices).

## Dashboard used by many people at the same time

1. Optional: use Metabase's [Usage analytics](../usage-and-performance-tools/usage-analytics.md) to look at your Metabase usage stats\*.
2. Set up [caching](../configuring-metabase/caching.md) for the questions on your popular dashboard.
3. Run the dashboard during off-hours so that people can load the cached results in seconds instead of executing a fresh query to your database.

\* Available on Pro and Enterprise plans.

**Explanation**

If you have a dashboard that many people check around the same time (e.g., at the start of the work day), you may end up with queued queries or saturated database connections. Caching allows you to prepare for peak traffic by running those slow queries once, ahead of time, so that the results are ready to go.

Caching takes less effort because it doesn't involve any changes to your schemas or databases. If you're ready to invest more resources into the root cause of dashboard performance issues, check out this list of common [schema and database optimizations](https://metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#organize-data-to-anticipate-common-questions).

## Embedded dashboard is slow compared to original dashboard

1. To speed up the embedded dashboard, set up a [locked parameter to pre-filter your data](../embedding/static-embedding-parameters.md#restricting-data-in-a-static-embed).

**Explanation**

One of the easiest ways to make a question or dashboard run faster is to work with a smaller dataset. Your Metabase admin can apply automatic data limitations using things like [SSO](../people-and-groups/start.md#authentication), [data permissions](../permissions/data.md), and [data sandboxing](../permissions/data-sandboxes.md).

When someone loads a question or a dashboard in a static embed, however, that question or dashboard will query the full dataset (rather than a smaller dataset limited by permissions). Static, [signed embeds](../embedding/static-embedding.md) don't require people to be logged in, and unauthenticated people viewing the signed embed won't be subject to the permissions and data restrictions set up by your admin.

## Dashboard is slow compared to similar dashboards

1. Remove fields (columns) that you don't need in the final result.
2. Add a [filter](../questions/query-builder/introduction.md#filtering) to reduce the amount of data being queried. For example:
   - Narrow down the time frame to the reporting period that you care about.
   - Exclude invalid records, such as: blanks, nulls, or rows with values like "cancelled", "expired", "invalid", and so on.
3. Remove [joins](../questions/query-builder/introduction.md#joining-data) to tables that aren't being used.
4. If you're aggregating data from the query builder, ask your database admin if there's a pre-aggregated [view](https://www.metabase.com/glossary/view) that you can use instead.

**Explanation**

When you update your question to use a minimal number of rows or columns (or switch your question to use a smaller table, such as a summary table) your database can spend less time scanning those records in order to return your results. Narrowing the scope of your question is especially important to think about if you're [starting from someone else's saved question or model](../questions/query-builder/introduction.md#play-around-with-saved-questions), because you might not need all of the data that the original creator decided to include.

If all of your dashboards are slow, you might be limited by the performance of a particular data source. In that case, we recommend teaming up with your database admin to [Troubleshoot database performance](./db-performance.md).

## Related problems

- [Error message: your question took too long](./timeout.md).
- [Questions that use numbers, dates, or times are slower than other questions](./db-performance.md#questions-that-use-number-date-or-timestamp-columns).
- [I can't save my question or dashboard](./proxies.md).
- [I can't view or edit a question or dashboard](./cant-view-or-edit.md).
- [My visualizations are wrong](./visualization.md).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).

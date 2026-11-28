---
title: Troubleshoot performance and notifications
summary: Find slow dashboards and questions, what's putting load on your databases, whether caching works, whether subscriptions and alerts were sent, and content that's broken or failing.
---

# Troubleshoot performance and notifications

{% include plans-blockquote.html feature="Usage analytics" %}

These recipes help you find out why dashboards or your databases are slow, why a subscription or alert didn't arrive, and what's broken. Where a tool in [Monitor](../monitor/start.md) answers the question, the recipe starts there. Use [usage analytics](./usage-analytics.md) for history and for questions Monitor doesn't answer.

To keep a question you build, save it to the **Custom reports** collection inside Usage analytics. For the columns in each model, see the [Usage analytics reference](./usage-analytics-reference.md).

## Find slow dashboards and questions

The **Slow** tab in [Content diagnostics](../monitor/content-diagnostics.md) lists questions with a median run time over 15 seconds in the last 30 days, and the dashboards that contain them.

For trends and rankings, open the **Performance overview** dashboard in Usage analytics and check **Slowest dashboards**, **Slowest questions**, and **Dashboards with more questions in the same tab**.

To see which cards slow down one dashboard:

1. Open the **Query log** model.
2. Filter **Dashboard ID** to the dashboard.
3. Summarize by **Average of Running Time Seconds**, grouped by **Card ID**.

To speed them up, see [My dashboard is slow](../troubleshooting-guide/my-dashboard-is-slow.md) and [Making dashboards faster](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster).

## Find what's putting the most load on your databases

The **Performance overview** dashboard ranks **Questions consuming most resources**, **Dashboards consuming most resources**, and **Users consuming most resources**.

To find out what ran during a spike, like a jump in your data warehouse bill:

1. Open the **Query log** model.
2. Filter **Started At** to the spike and **Database ID** to the database.
3. Summarize by **Count** and **Sum of Running Time Seconds**, grouped by **Query Source**.

A high count for `dashboard-subscription`, `pulse`, or `cache-refresh` points to subscriptions, alerts, or cache refreshes running more often than you expected. Group by **Card ID** or **User ID** to find the questions or people behind it.

**Running Time Seconds** is how long Metabase waited for the query, not what your data warehouse charged. To match Metabase queries to your warehouse's own query history, use the comment that Metabase adds to each query it runs.

## Check whether caching is working

The **Performance overview** dashboard shows the **Weekly cache hit rate** across your Metabase. For one question or dashboard:

1. Open the **Query log** model.
2. Filter **Card ID** or **Dashboard ID** to the item.
3. Summarize by **Count**, grouped by **Cache Hit**.

If an item never hits the cache, check its [caching policy](../configuring-metabase/caching.md). Runs with the **Query Source** `cache-refresh` are Metabase refreshing the cache ahead of time.

## List all subscriptions and alerts

For alerts, use [Alerts management](../monitor/alerts-management.md), which also lists failing alerts and alerts whose owner was deactivated.

For dashboard subscriptions, open the **Dashboard subscriptions and alerts** dashboard in Usage analytics. To filter or export the list, use the **Dashboard subscriptions** and **Alerts** models. Both have **Recipients**, **Recipient Type**, **Schedule Type**, **Creator ID**, and **Archived**. Filter **Archived** to false to see only active subscriptions and alerts.

## Check whether a subscription or alert was sent

1. Open the **Activity log** model.
2. Filter **Topic** to `subscription-send` or `alert-send`, and **Entity ID** to the subscription or alert.

To see whether the queries behind it failed, filter the **Query log** model's **Pulse ID** to the same ID and check **Error**. For each send attempt and its status, see [Background tasks](../monitor/background-tasks.md).

A send in usage analytics means Metabase handed the message to your email server or Slack. If people say they didn't get it, check delivery on that side.

## Find questions that fail

[Erroring questions](../monitor/erroring-questions.md) lists questions whose last run failed, and lets you rerun them.

For history, open the **Query log** model, filter **Error** to **Not empty**, and summarize by **Count**, grouped by **Card ID**. Add **Dashboard ID** to find the dashboards with broken cards.

## Find content that broke after a database change

When someone removes or renames a column in your database, or hides it in the table metadata, questions and models that use the column break. The **Broken dependencies** list in [Dependency diagnostics](../monitor/dependency-diagnostics.md) shows which items are affected and what each one depends on.

To check before you make the change, open the table in the [dependency graph](../data-modeling/tools/graph.md).

## Check whether a sync ran

If new tables or columns don't show up, or data seems out of date:

1. Open [Background tasks](../monitor/background-tasks.md) in Monitor.
2. Look for sync and scan tasks for the database. **Status** shows whether each one succeeded, and **Duration** shows how long it took.
3. To see when the next sync is scheduled, check [Scheduled jobs](../monitor/scheduled-jobs.md).

For trends, the **Performance overview** dashboard has **Total time spent on sync per day**, and the **System tasks** model covers the last 14 days of tasks.

## Check Metabase's logs for errors

When something fails without a clear message in Metabase, open [Application logs](../monitor/application-logs.md) in Monitor. You can view and download the logs, and temporarily raise the logging level for one part of Metabase while you reproduce the problem.

## Further reading

- [Usage analytics](./usage-analytics.md)
- [Usage analytics reference](./usage-analytics-reference.md)
- [Audit activity](./audit-activity.md)
- [Understand usage](./understand-usage.md)

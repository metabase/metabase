---
title: Data app analytics
summary: See the questions and actions that your data apps run, who runs them, and what fails.
---

# Data app analytics

{% include plans-blockquote.html feature="Data app analytics" %}

_Monitor > Data app analytics_

Data app analytics logs each question and action that your [data apps](../data-apps/start.md) run: which app ran it, who ran it, when it ran, how long it took, and whether it failed. Use data app analytics to see which apps people use, and which questions and actions fail.

To view the analytics:

1. Click the **grid** icon in the upper right and select **Monitor**.
2. In the left sidebar, under **AI Auditing**, click **Data app analytics**.

Only admins can see data app analytics. Runs from an app's [preview on your computer](../data-apps/build.md#preview-the-app-on-your-computer) aren't logged.

You can filter the log by app, by person, by time, and to only questions or only actions. By default, the log shows the last 30 days. Apps that you deleted stay in the log, listed by their slug.

## IP addresses and user agents are off by default

The log shows people's IP addresses and user agents only if you turn on [`MB_ANALYTICS_PII_RETENTION_ENABLED`](../configuring-metabase/environment-variables.md#mb_analytics_pii_retention_enabled).

## Build your own reports on data app activity

To build your own questions about data app activity, click **Query this data**. Metabase opens the query builder on the [query log](../usage-and-performance-tools/usage-analytics-reference.md#query-log), filtered to data app activity.

The questions that an app reads also count as views of those questions in [Usage analytics](../usage-and-performance-tools/usage-analytics.md).

## How long Metabase keeps data app activity

Metabase keeps query log rows for 720 days by default, then deletes them, so older activity drops off the page. To change the limit, set [`MB_AUDIT_MAX_RETENTION_DAYS`](../configuring-metabase/environment-variables.md#mb_audit_max_retention_days).

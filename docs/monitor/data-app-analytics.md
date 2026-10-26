---
title: Data app analytics
summary: See the questions and actions that your data apps run, who runs them, and what fails.
---

# Data app analytics

{% include plans-blockquote.html feature="Data app analytics" %}

_Monitor > Data app analytics_

The Data app analytics page logs each question and action that your [data apps](../data-apps/start.md) run: who ran it, how long it took, and whether it failed.

To view the analytics:

1. Click the **grid** icon in the upper right and select **Monitor**.
2. In the left sidebar, under **AI Auditing**, click **Data app analytics**.

Only admins can see the page. Runs from an app's local development preview don't show up on the page.

## Filter data app activity

Each filter above the log is labeled with its default value:

- **All data apps**: Pick one app. **Installed** lists your apps by name. **Removed** lists apps that are in the log but no longer exist.
- **All entity types**: Pick **Question** or **Action** to see only that kind of run.
- **All users**: Pick one person.
- **Last 30 days**: Pick another time window.

## What the log shows for each run

Each row is one question or action run: when it started, who ran it, how long it took, how many rows it returned, the database it queried, the query it ran, and the error message if the run failed.

A few columns need more explanation:

- **Identifier**: The app's slug, from its address `/apps/<slug>`.
- **Name**: The app's display name. Empty for apps that no longer exist.
- **Entity type**: **Question** or **Action**. The **Question** or **Action** column names the one that ran.
- **User agent**, **Sanitized user agent**, and **IP address**: Only show up if you turn on [`MB_ANALYTICS_PII_RETENTION_ENABLED`](../configuring-metabase/environment-variables.md#mb_analytics_pii_retention_enabled), which is off by default.

## Build your own reports on data app activity

To build your own questions on this activity, click **Query this data**. It opens the query builder on the [query log](../usage-and-performance-tools/usage-analytics-reference.md#query-log), filtered to data app activity.

The questions that an app reads also count as views of those questions in [Usage analytics](../usage-and-performance-tools/usage-analytics.md).

## How long Metabase keeps data app activity

Metabase keeps query log rows for 720 days by default, then deletes them, so older activity drops off the page. To change the limit, set [`MB_AUDIT_MAX_RETENTION_DAYS`](../configuring-metabase/environment-variables.md#mb_audit_max_retention_days).

---
id: troubleshoot-slow-dashboards
title: Slow dashboards and questions
description: Dashboards or questions take a long time to load, time out, got slower recently, or an embedded dashboard is slower than the same dashboard in Metabase.
references:
  - troubleshooting-guide/my-dashboard-is-slow.md
  - troubleshooting-guide/db-performance.md
  - troubleshooting-guide/timeout.md
  - configuring-metabase/caching.md
---
Ask one question at a time, and skip any the user has already answered.

First questions, in this order:
1. Is it one dashboard, or everything?
2. Is it always slow, or only at certain times of day?
3. Is the same query slow when run directly in the database? If it is, the database is the bottleneck, not Metabase.
4. Is it only slow when embedded?

Causes to check, most common first:

One dashboard
- Too many cards on one dashboard or tab.
- Filters without default values, so cards load a lot of data.
- Heavy queries. Caching and models can help.
- Many people opening it at the same time.

Everything, or only at certain times
- The data warehouse is under load or undersized.
- The Metabase server is short on resources.
- If the diagnostic info shows the H2 application database, flag that H2 isn't meant for production.

Embedded only
- Use the embedded dashboard section of the slow dashboard troubleshooting page.

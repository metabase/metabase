---
title: Advanced caching controls
---

# Advanced caching controls

{% include plans-blockquote.html feature="Question-specific caching" %}

All Metabase editions include global caching controls. Some plans include additional caching options that let you control caching for each database, as well as individual questions.

## Caching per database

You can override your default caching options for each database connection, caching the results for more or less time than the default time-to-live (TTL) duration set by your [site-wide caching settings][caching-admin]. Setting caching per question is especially useful when data relevant to the question has a different natural cadence than your site-wide caching rule.

Go to **Admin settings** > **Databases** and select your database connection. Under **Advanced settings**, set the **Default result cache duration**, which determines how long to keep question results for that database. By default, Metabase will use the value you supply on the [cache settings page][caching-admin], but if this database has other factors that influence the freshness of data, it could make sense to set a custom duration. You can also choose custom durations on individual questions or dashboards to help improve performance.

## Caching per question

You can override your default caching options for questions, caching the results for more or less time than the default time-to-live (TTL) duration set by your site-wide caching settings. Setting caching per question is especially useful when data relevant to the question has a different natural cadence than your site-wide caching rule, such as when the question queries data that doesn't change often.

To learn how to set caching preferences on individual questions, check out our [User's guide][caching].

For an overview of site-wide caching available to all Metabase editions, check out our [Adminstrator's guide][caching-admin].

[caching]: ../questions/sharing/answers.md#caching-results
[caching-admin]: ../administration-guide/14-caching.html

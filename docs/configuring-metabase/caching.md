---
title: Caching query results
redirect_from:
  - /docs/latest/administration-guide/14-caching
  - /docs/latest/enterprise-guide/cache
---

# Caching query results

If your results don't change frequently, you may want to cache your results, that is: store your results in Metabase so that the next time you visit the question, Metabase can retrieve the stored results rather than query the database again. 

For example, if your data only updates once a day, there's no point in querying the database more than once a day, as they data won't have changed. Returning cached results can be significantly faster, as the database won't have to redo the work to answer your query.

Metabase gives you the ability to automatically cache query results. On paid plans, you can also control caching for specific:

- [Databases](#caching-per-database)
- [Questions](#caching-per-question)
- [Dashboards](#caching-per-dashboard)

You can also [cache models](../data-modeling/models.md#caching-individual-models).

## Enabling global caching

1. Go to **Admin settings** > **Caching** (in the side nav).
2. Click the toggle under **Saved Questions**.

Once you've enabled caching, you can choose when and what to cache from your [caching settings](#caching-settings).

## Last updated at

Questions that use the cache (as defined by your [minimum query duration](#minimum-query-duration) setting) will display a "last cached at" timestamp in the question's **info** panel.

## Getting fresh results

To override a cached query result, re-run the question using the **refresh** button (counterclockwise arrow).

## Caching location

If you're self-hosting Metabase, cached queries will be saved to your [application database](../installation-and-operation/configuring-application-database.md).

If you're using Metabase Cloud, cached queries will be saved to Metabase's servers in the United States.

## Caching settings

Parameters you can use to define caching in Metabase:

- [Minimum query duration](#minimum-query-duration)
- [Cache time-to-live (TTL)](#cache-time-to-live-ttl)
- [Max cache entry size](#max-cache-entry-size)

### Minimum query duration

Metabase uses this number to decide whether a question will be cached or not. 

Choose a duration (in seconds) that will trigger the cache. For example, you can enter "60" if you want to cache all questions that take longer than one minute to load.

Your Metabase instance keeps track of the average query execution times of your queries. You can view these statistics from your [auditing tools](../usage-and-performance-tools/audit.md) (on paid plans).

### Cache time-to-live (TTL) multiplier

The TTL multiplier tells Metabase how long to persist a cached query result, using this formula:

> TTL multiplier x query's average execution time = query's cache lifetime

For example, if you enter a multiplier of 10, a query that takes 5 seconds on average will be cached for 50 seconds. A query that takes 10 minutes will be cached for 100 minutes. Each query’s cache lifetime is proportional to that query's execution time.

### Max cache entry size

To prevent cached results from taking up too much space on your server, you can set the maximum size of each question's cache in kilobytes.

## Advanced caching controls

{% include plans-blockquote.html feature="Advanced caching controls" %}

All Metabase editions include global caching controls. On paid plans, you can override your global [time-to-live (TTL) setting](#cache-time-to-live-ttl-multiplier) to set different cache lifetimes for specific databases, questions, or dashboards.

### Caching per database

This setting tells Metabase how long to keep the cached results from a specific database.

1. Make sure [caching is enabled](#enabling-global-caching).
2. Go to **Admin settings** > **Databases** and select your database.
3. Open **Advanced options** and find the **Default result cache duration**.
4. Click **Custom** and enter a cache duration in hours.

This setting is useful for databases that take longer to query, or databases that are kept up to date on a special cadence. 

The database cache duration will override your [global TTL settings](#cache-time-to-live-ttl-multiplier).

### Caching per question

This setting tells Metabase how long to keep the cached results for a specific question.

1. Make sure [caching is enabled](#enabling-global-caching).
2. Go to your question.
3. Click on the **info** icon.
4. Click **Cache configuration**.
5. Enter a cache duration in hours.
6. Click **Save changes**.

You can use this setting to update questions on the same cadence as your data. For example, if your data gets updated daily, you can set the **Cache configuration** to 24 hours.

> This setting will only apply to questions that meet the [minimum query duration](#minimum-query-duration). You can check a question's average query duration from Metabase's [auditing tools](../usage-and-performance-tools/audit.md).

If a question meets the minimum query duration, this setting will override:

- [global TTL settings](#cache-time-to-live-ttl-multiplier)
- [database cache duration](#caching-per-database)

### Caching per dashboard

This setting that tells Metabase how long to keep the cached results for each of the questions on a dashboard.

1. Make sure [caching is enabled](#enabling-global-caching).
2. Go to your dashboard.
3. Click on the **info** icon.
4. Click **Cache configuration**.
5. Enter a cache duration in hours.
6. Click **Save changes**.

> The **Cache configuration** will only apply to questions that meet the [minimum query duration](#minimum-query-duration). You can check a question's average query duration from Metabase's [auditing tools](../usage-and-performance-tools/audit.md).

For questions that meet the minimum query duration, your dashbaord cache configuration will override:

- [global TTL settings](#cache-time-to-live-ttl-multiplier)
- [database cache duration](#caching-per-database)
- [question cache configuration](#caching-per-question)

---
title: Caching query results
redirect_from:
  - /docs/latest/administration-guide/14-caching
  - /docs/latest/enterprise-guide/cache
---

# Caching query results

{% include plans-blockquote.html feature="Advanced caching controls" %}

If your question results don't change frequently, you may want to store the results so that the next time anyone visits the question, Metabase can retrieve the stored results rather than query the database again.

For example, if your data only updates once a day, there's no point in querying the database more than once a day, as they data won't have changed. Returning cached results can be significantly faster, as the database won't have to recompute the results to load your question.

## Cache invalidation policies

These policies determines how long cached results will be stored.

- [Duration](#duration-caching-policy)
- [Schedule](#schedule-caching-policy)
- [Adaptive](#adaptive-caching-policy)
- [Don't cache results](#dont-cache-results)

### Duration caching policy

Keep the cache for a number of hours. When someone runs a query, Metabase will first check if it's cached the results. If not, it runs the query and caches the results for as long as you set the duration.

### Schedule caching policy

Pick when to regularly invalidate the cache. Metabase will periodically run the query according to the schedule you set and store the results. Other people running queries have no effect on when the results are refreshed; they'll always get the cached results unless they explicitly [clear the cache](#clear-cache).

You can schedule caching to invalidate:

- Hourly
- Daily
- Weekly
- Monthly

We do not yet support lunar cycles.

### Adaptive caching policy

Use a query’s average execution time to determine how long to cache the query's results.

- **Minimum query duration**: Metabase will cache this question if it has an average query execution time greater than this many seconds.
- **Multiplier**: Metabase will cache questions with an average query execution time greater than this many seconds.

On [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans, you can view querying and caching stats in the [Metabase analytics](../usage-and-performance-tools/usage-analytics.md).

### Don’t cache results

Always re-run the query to refresh results.

## Set caching policies at different levels

{% include plans-blockquote.html feature="Advanced caching controls" %}

You can set up caching at different levels, from largest to smallest scope:

- [Setting a default caching policy](#setting-a-default-caching-policy)
- [Database policy (specific to each connected database)](#database-caching-policy)*
- [Model caching](../data-modeling/models.md#model-caching)*
- [Dashboard](#Dashboard-caching)*
- [Question](#question-caching)*

* Denotes [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) features

### Default caching policy

![Data caching settings in the Admin settings under the Performance tab](./images/data-caching-settings.png)

To set up a default caching policy for your database: Hit Cmd/Ctrl + k to bring up the command palette and search for **Performance**. Or, click through **Gear** settings icon > **Admin settings**
- **Performance** > **Data caching settings**.

Click on the button next to **Default policy**, and select a [cache invalidation policy](#cache-invalidation-policies).

## Database caching policy

{% include plans-blockquote.html feature="Database caching controls" %}

Same as the default caching policy, though you can set a caching policy for specific databases.

### Caching per dashboard

{% include plans-blockquote.html feature="Dashboard caching controls" %}

You can tell Metabase how long to keep the cached results for each of the questions on a dashboard.

1. Go to your dashboard.
2. Click on the **info** icon.
3. Click **Caching policy**.
4. Select the [caching invalidation policy](#cache-invalidation-policies).
5. Save your changes.

### Caching per question

{% include plans-blockquote.html feature="Question caching controls" %}

1. Go to your question.
2. Click on the **info** icon.
3. Click **Caching policy**.
4. Select the [caching invalidation policy](#cache-invalidation-policies).
5. Save your changes.

## Clearing cache

To clear the cache for a question or dashboard and refresh the results: Click through the **Info > Caching policy > Clear cache** (the Clear cache button is at the bottom of the sidebar).

## Caching location

If you're self-hosting Metabase, cached question results will be saved to your [application database](../installation-and-operation/configuring-application-database.md).

If you're using Metabase Cloud, cached question results will be saved to Metabase's servers in the United States.

## Last updated at

Questions that use the cache will display a "last cached at" timestamp in the question's **info** panel.

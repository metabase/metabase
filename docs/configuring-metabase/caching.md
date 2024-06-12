---
title: Caching query results
redirect_from:
  - /docs/latest/administration-guide/14-caching
  - /docs/latest/enterprise-guide/cache
---

# Caching query results

{% include plans-blockquote.html feature="Advanced caching control" %}

If your question results don't change frequently, you may want to store the results so that the next time anyone visits the question, Metabase can retrieve the stored results rather than query the database again.

For example, if your data only updates once a day, there's no point in querying the database more than once a day, as the data won't have changed. Returning cached results can be significantly faster, as the database won't have to recompute the results to load your question.

## Cache invalidation policies

These policies determines how long cached results will be stored.

- [Duration](#duration-caching-policy)
- [Schedule](#schedule-caching-policy)
- [Adaptive](#adaptive-caching-policy)
- [Don't cache results](#dont-cache-results)

### Duration caching policy

{% include plans-blockquote.html feature="Duration caching policy" %}

Keep the cache for a number of hours. When someone runs a query, Metabase will first check if it's cached the results. If not, it runs the query and caches the results for as long as you set the duration.

### Schedule caching policy

{% include plans-blockquote.html feature="Schedule caching policy" %}

Pick when to regularly invalidate the cache. Metabase will only store results when people run a query, and it will clear the cached results according to the cadence you set here.

You can schedule caching to invalidate:

- Hourly
- Daily
- Weekly
- Monthly

We do not yet support lunar cycles.

### Adaptive caching policy

Use a query’s average execution time to determine how long to cache the query's results.

- **Minimum query duration**: Metabase will cache this question if it has an average query execution time greater than this many seconds.
- **Multiplier**: Metabase will cache questions with an average query execution time greater than this many seconds. For example, if a question takes on average 10 seconds to return results, and you set a multiplier of 100, Metabase will store the cache for 10 x 100 seconds: 1,000 seconds (~16 minutes).

On [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans, you can view querying and caching stats in the [Metabase analytics](../usage-and-performance-tools/usage-analytics.md) collection.

### Don’t cache results

Always re-run the query to refresh results.

## Set caching policies at different levels

You can set up caching at different levels, from largest to smallest scope. Policies set at more restricted scopes override policies set at larger scopes. So a policy set on a question will take precedence over a dashboard, database, or default policy.

- [Setting a default caching policy](#default-caching-policy)
- [Database caching policy (specific to each connected database)](#database-caching-policy)*
- [Dashboard caching](#dashboard-caching-policy)*
- [Question caching](#question-caching-policy)*

_* Denotes [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) features._

### Default caching policy

![Data caching settings in the Admin settings under the Performance tab](./images/data-caching-settings.png)

To set up a default caching policy for your Metabase: Hit Cmd/Ctrl + k to bring up the command palette and search for **Performance**. Or, click through **Gear** settings icon > **Admin settings** > **Performance** > **Data caching settings**.

Click on the button next to **Default policy**, and select a [cache invalidation policy](#cache-invalidation-policies).

### Database caching policy

{% include plans-blockquote.html feature="Database caching" %}

Same as the default caching policy, though you can set a caching policy for specific databases.

### Dashboard caching policy

{% include plans-blockquote.html feature="Dashboard caching" %}

To set a caching policy for a dashboard, you must have [curate access](../permissions/collections.md#curate-access) to the dashboard's collection.

1. Go to your dashboard.
2. Click on the **info** icon.
3. Click **Caching policy**.
4. Select the [caching invalidation policy](#cache-invalidation-policies).
5. Save your changes.

### Question caching policy

{% include plans-blockquote.html feature="Question caching" %}

To set a caching policy for a question, you must have [curate access](../permissions/collections.md#curate-access) to the question's collection.

1. Go to your question.
2. Click on the **info** icon.
3. Click **Caching policy**.
4. Select the [caching invalidation policy](#cache-invalidation-policies).
5. Save your changes.

## Clearing the cache

To clear the cache and refresh the results:

- **Questions and dashboards**: Vist the item and click through the **Info > Caching policy > Clear cache** (the "Clear cache" button is at the bottom of the sidebar).
- **Database**: Click the **Gear** icon and click through **Admin settings** > **Performance** > **Database caching settings**. Select your database and click the **Clear cache** button (at the bottom of the page).

## Caching location

If you're self-hosting Metabase, cached question results will be saved to your [application database](../installation-and-operation/configuring-application-database.md).

If you're using Metabase Cloud, cached question results will be saved to Metabase's servers in the United States (as our Cloud service manages your application database for you.)

## Further reading

- [Model persistence](../data-modeling/model-persistence.md)

---
title: Troubleshooting models
---

# Troubleshooting models

What kind of problem are you having with your [model][model-docs]?

## Can't create a model

If you don't see [the model button][model-button-image] (three squares):

1. Check if you're using a Metabase version that's 0.42.0 or greater by going to the top right of the screen and clicking on the **gear** icon > **About Metabase**.
2. Clear your browser cache.
3. Ask your Metabase admin to clear the proxy cache (if you're using one).
4. Ask your Metabase admin if [nested queries are enabled][nested-query-settings-docs] under **Admin** > **Settings** > **General**.

## Can't edit or save changes to a model

If your changes to a model's metadata or underlying question aren't showing up:

1. Refresh your browser to confirm you're not viewing cached results.
2. Search for [known model issues][known-issues-models] using the label `Querying/Models`. For more information, go to [How to find a known bug or limitation][known-issues].

## Model performance is poor

1. Use model persistence.

    - Metabase can [write back to your data warehouse][model-persistence]. If you enable model persistence, Metabase will read a pre-computed and materialized version of the model directly from the database instead of running the query from scratch. Please consider this option is only available in some supported data warehouses.

2. Optimize the underlying saved question or SQL query.

    - [Ask for less data][limit-data-learn].
    - For models that use SQL questions, [look for bottlenecks using SQL EXPLAIN][sql-explain-learn].

3. Optimize your database schemas.

    - [Aggregate data ahead of time with summary tables][summary-tables-learn].
    - [Index frequently queried columns][indexes-learn].
    - [Denormalize your data][denormalize-data-learn].
    - [Materialize views][materialize-views-learn].
    - [Pull data out of JSON and slot its keys into columns][flatten-json-learn].

4. Optimize your data warehouse(s) or database(s).

    - [Replicate your database][replicate-database-learn].
    - [Consider a database optimized for analytics][analytics-database-learn].

**Explanation**

Models are a type of saved question, so they will only perform as fast as the original question or SQL query.

If you want to improve the performance of a model, you can make optimizations at the query, schema, or database level (depending on your data permissions, technical expertise, and willingness to tinker).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known model issues][known-issues-models] using the label `Querying/Models`. For more information, go to [How to find a known bug or limitation][known-issues].

[analytics-database-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#consider-a-database-optimized-for-analytics
[denormalize-data-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#denormalize-data
[discourse]: https://discourse.metabase.com/
[flatten-json-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#pull-data-out-of-json-and-slot-its-keys-into-columns
[indexes-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#index-frequently-queried-columns
[known-issues]: ./known-issues.md
[known-issues-models]: https://github.com/metabase/metabase/labels/Querying%2FModels
[limit-data-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#ask-for-less-data
[materialize-views-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#materialize-views-create-new-tables-to-store-query-results
[model-button-image]: https://www.metabase.com/learn/images/models/model-icon.png
[model-docs]: ../data-modeling/models.md
[nested-query-settings-docs]: ../configuring-metabase/settings.md#enable-nested-queries
[replicate-database-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#replicate-your-database
[sql-explain-learn]: https://www.metabase.com/learn/grow-your-data-skills/learn-sql/working-with-sql/sql-best-practices#explain
[summary-tables-learn]: https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/making-dashboards-faster#aggregate-data-ahead-of-time-with-summary-tables
[troubleshooting-sandboxing]: ./sandboxing.md
[model-persistence]: https://www.metabase.com/docs/latest/data-modeling/model-persistence

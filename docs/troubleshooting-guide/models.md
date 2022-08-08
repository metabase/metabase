---
title: Troubleshooting models
---

# Troubleshooting models

What kind of problem are you having with your [model][model-docs]?

- [Can't create a model](#cant-create-a-model).
- [Can't edit or save changes to a model](#cant-edit-or-save-changes-to-a-model).
- [Model performance is poor](#model-performance-is-poor).
- [Model doesn't work with data sandboxing][troubleshooting-sandboxing].

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

1. Optimize the underlying saved question or SQL query.

    - [Ask for less data][limit-data-learn].
    - For models that use SQL questions, [look for bottlenecks using SQL EXPLAIN][sql-explain-learn].

2. Optimize your database schemas.

    - [Aggregate data ahead of time with summary tables][summary-tables-learn].
    - [Index frequently queried columns][indexes-learn].
    - [Denormalize your data][denormalize-data-learn].
    - [Materialize views][materialize-views-learn].
    - [Pull data out of JSON and slot its keys into columns][flatten-json-learn].

3. Optimize your data warehouse(s) or database(s).

    - [Replicate your database][replicate-database-learn].
    - [Consider a database optimized for analytics][analytics-database-learn].

**Explanation**

Models are a type of saved question, so they will only perform as fast as the original question or SQL query.

If you want to improve the performance of a model, you can make optimizations at the query, schema, or database level (depending on your data permissions, technical expertise, and willingness to tinker).

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community][discourse].
- Search for [known model issues][known-issues-models] using the label `Querying/Models`. For more information, go to [How to find a known bug or limitation][known-issues].

[analytics-database-learn]: /learn/administration/making-dashboards-faster.html#consider-a-database-optimized-for-analytics
[denormalize-data-learn]: /learn/administration/making-dashboards-faster.html#denormalize-data
[discourse]: https://discourse.metabase.com/
[flatten-json-learn]: /learn/administration/making-dashboards-faster.html#pull-data-out-of-json-and-slot-its-keys-into-columns
[indexes-learn]: /learn/administration/making-dashboards-faster.html#index-frequently-queried-columns
[known-issues]: ./known-issues.html
[known-issues-models]: https://github.com/metabase/metabase/labels/Querying%2FModels
[limit-data-learn]: /learn/administration/making-dashboards-faster.html#ask-for-less-data
[materialize-views-learn]: /learn/administration/making-dashboards-faster.html#materialize-views-create-new-tables-to-store-query-results
[model-button-image]: /learn/images/models/model-icon.png
[model-docs]: ../data-modeling/models.md
[nested-query-settings-docs]: ../administration-guide/08-configuration-settings.html#enabled-nested-queries
[replicate-database-learn]: /learn/administration/making-dashboards-faster.html#replicate-your-database
[sql-explain-learn]: /learn/sql-questions/sql-best-practices.html#explain
[summary-tables-learn]: /learn/administration/making-dashboards-faster.html#aggregate-data-ahead-of-time-with-summary-tables
[troubleshooting-sandboxing]: ./sandboxing.html

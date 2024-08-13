---
title: Model persistence
---

# Model persistence

> Currently available for PostgreSQL, MySQL, and Redshift.

Metabase can persist the results of your models so that your models (and the questions based on those models) load faster.

Metabase will store model results in tables in a bespoke schema in your data warehouse (not the Metabase application database). When people ask questions based on your models, Metabase will use the tables with the stored results instead of re-running the model's query.

> Model persistence doesn't work with [data sandboxing](../permissions/data-sandboxes.md).

## Turn on model persistence in Metabase

To persist models for faster loading, you'll need to turn on model persistence for:

1. [Your Metabase](#turn-on-model-persistence-for-your-metabase)
2. [Individual databases](#turn-on-model-persistence-for-each-database)
3. [(Optional) individual models](#turn-on-model-persistence-for-individual-models)

### Turn on model persistence for your Metabase

To turn on model persistence for your Metabase, go to **Admin settings** > **Performance** > **Model persistence**.

You can set models to refresh based on one of the default frequencies (every 1 hour, 2 hours, etc.), or select the **Custom** option to use [cron syntax](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html) to specify your own update frequency.

The cron scheduler uses the [Report Timezone](../configuring-metabase/localization.md#report-timezone) if selected. Otherwise the scheduler will use the System Timezone (which defaults to GMT in [Metabase Cloud](https://www.metabase.com/cloud)).

We recommend scheduling your models to refresh on a frequency that makes sense with how often your source tables update with new data.

If someone [changes the query definition of a model](./models.md#edit-a-models-query), any question based on that model will re-run the model's query until the next scheduled model refresh.

## Turn on model persistence for each database

Once you've turned on model persistence for your Metabase, you'll need to set it up for each specific database, as Metabase will need to create a schema in your data warehouse to store the persisted models.

1. Go to **Admin settings** > **Databases** > [your database] > **Turn model persistence on**. If the credentials you've given Metabase to connect to your database are permissive, Metabase should do all the work for you: Metabase will check if the schema already exists, or otherwise attempt to create it. If the connection's credentials _lack_ the necessary permissions to create the schema in your database, you'll need to create the schema in the database yourself.

2. To manually create the schema in your data warehouse, click on the **info icon** to get the schema name.

3. Create the schema in your database---make sure you use the exact schema name from step 1. For example, if you're running PostgreSQL as your data warehouse, you'd create the schema by running `CREATE SCHEMA IF NOT EXISTS schema_name`, with `schema_name` being whatever Metabase showed you in the info icon.

4. Ensure that the credentials Metabase uses to connect to your data warehouse can manage and write to that schema.

## Turn on model persistence for individual models

{% include plans-blockquote.html feature="Individual model persistence" %}

You can also toggle persistence on or off for individual models. When viewing a model, click on the **...** in the upper right and select **Turn model persistence on/off** (you'll need [Curate access](../permissions/collections.md#curate-access) to the model's collection to do this).

Toggling persistence for individual models is useful for models with data that updates at different frequencies than the schedule you set for other models in that database, or for models that are used more or less than other models in that database.

## Refreshing a model's persisted results

To refresh a model's results, go to the model and click on the **i** info icon. In the info sidebar that opens, you'll see a note about when Metabase last refreshed the model's results, and an icon to refresh the results.

## View model persistence logs

You can view the logs for model persistence by clicking on the **gear** icon in the upper right and selecting **Admin settings** > **Tools** > **Model caching logs**. See [Admin tools](../usage-and-performance-tools/tools.md).

## Difference between persisted models and caching

Persisted models differ from [cached results](../configuring-metabase/caching.md):

- **Models are persisted in your data warehouse; cached results are stored in the application database**. Metabase stores cached results in its application database. Metabase persists models in your connected data warehouse as tables.
- **Metabase refreshes model results and invalidates cached results**. Metabase will refresh results of models according to the schedule you set. That is, Metabase will re-run the model's query and store the results in your data warehouse. For cached results of saved questions and dashboards, Metabase won't run the queries automatically; it will cache results when people view the question or dashboard, and invalidate the cached results according to the caching policy you set.

## Further reading

- [Models](./models.md)
- [Caching policies](../configuring-metabase/caching.md)

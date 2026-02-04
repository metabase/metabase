---
title: Transforms overview
summary: Transforms allow you to wrangle your data in Metabase, write the query results back to your database, and reuse them in Metabase as sources for new queries.
---

# Transforms

_Data Studio > Transforms_

Transforms can be used to, well, transform your data - do stuff like preprocessing, cleaning, joining tables, pre-computing metrics. Transforms give you the ability to do the "T" of "ETL" within Metabase.

You'll write a query or a Python script in Metabase, a transform will run this query or script, create a table in your target database containing the results, and sync that table to Metabase, so it can be used as a data source for questions or other transforms.

## Transforms overview

- **Transforms** are queries (created either with SQL or the query builder) or Python scripts that write back to your database and create a new, persistent table. Use transforms to clean, join, or pre-aggregate data.
- Transforms are scheduled and organized using **tags** and **jobs**.
  - You assign tags (e.g., daily, hourly) to group your transforms.
  - A job runs on a schedule (e.g., every day at midnight) and executes all transforms that have been assigned a specific tag.
- Each execution of a transform is a **run**. A run replaces the target table with fresh results. You can review the history of runs to monitor their success or failure.

## Databases that support transforms

Currently, Metabase can create transforms on the following databases:

- BigQuery
- ClickHouse (only ClickHouse Cloud)
- MySQL/MariaDB
- PostgreSQL
- Redshift
- Snowflake
- SQL Server

You can't create transforms on databases that have [Database routing](../../permissions/database-routing.md) enabled, or on Metabase's Sample Database.

Transforms will create tables in your database, so the database user you use for your connection must have appropriate privileges. See [Database users, roles, and privileges](../../databases/users-roles-privileges.md).

## Types of transforms

Metabase supports two types of transforms: query-based transforms and Python transforms. You can write query-based transforms in SQL or Metabase Query builder, and they will run in your database. Python transforms are written in (unsurprisingly) Python and will run in a dedicated execution environment. For more details:

- [How query-based transforms work](query-transforms.md#how-query-based-transforms-work)
- [How Python transforms work](python-transforms.md#how-python-transforms-work)

## Permissions for transforms

If you are running Metabase Open Source/Starter, Admins (and only Admins) can see and run transforms.

Metabase Pro/Enterprise comes with additional permission controls for transforms, see [Transform permissions](../../permissions/data.md).

To **see** the list of transforms on your instance, people need to be able to access Data Studio, so they need to be either an Admin of a member of the special [Data Analyst group](../../people-and-groups/managing.md).

To **execute** transforms on a database, people additionally need to have the [Transform permissions](../../permissions/data.md) for that database.

## See all transforms

_Data Studio > Transforms_

You can see all your Metabase's transforms:

1. Make sure you have [appropriate permissions to see transforms](#permissions-for-transforms).
2. Click on the **grid** icon on top right and go to **Data Studio**.
3. In the left sidebar, select **Transforms**.

## Create a transform

_Data Studio > Transforms_

If you're using remote sync, you won't be able to create transforms if your instance is in ["read-only" sync mode](../../installation-and-operation/remote-sync.md).

To create a transform:

1. Make sure you have [appropriate permissions for creating transforms](#permissions-for-transforms).
2. Click on the **grid** icon on top right and go to **Data Studio**.
3. In the left sidebar, select **Transforms**.
4. Click **+ New** and select a source for your transform.

   You can create your transform using Metabase's [graphical query builder](../../questions/query-builder/editor.md), SQL, or Python.

   For more information on transforms built with the query builder or SQL, see [query-based transforms](query-transforms.md). For more information on Python transforms, see and [Python transforms](python-transforms.md).

   If you select "Copy of a saved question" for the transform's source, you can copy the query of an existing Metabase question (either a SQL question or a query builder question) into your transform query. Metabase will only _copy_ the question's query. Later edits to that original question won't affect the transform's query.

5. Create the query or script for your transform.

   See [query-based transforms](query-transforms.md) and [Python transforms](python-transforms.md) for more information. You can reference target tables of other transforms when writing your transform.

   If you have the Metabot AI add-on, you can [use Metabot](#use-metabot-to-generate-code-for-transforms) to generate code for your transform.

6. Click **Save** in the top right corner and fill out the transform information:

   - **Name** (required): The name of the transform.
   - **Schema** (required): Target schema for your transform. This schema can be different from the schema of the source table(s). You create a new schema by typing its name in this field. You can only transform data _within_ a database; you can't write from one database to another.
   - **Table name** (required): Name of the table where Metabase will write and enter a name for the target table. Metabase will write the results of the transform into this table, and then sync the table in Metabase.
   - **Folder** (optional): The folder where the transform should live. Click on the field to pick a different folder or create a new one.
   - **Incremental transformation** (optional): see [Incremental query-based transforms](query-transforms.md#incremental-query-transforms) or [Incremental Python transforms](python-transforms.md)

7. Optionally, once the transform is saved, assign tags to your transform. Tags are used by [jobs](./jobs-and-runs.md) to run transforms on schedule.

## Use Metabot to generate code for transforms

> Code generation for transforms requires the **Metabot AI** and **Transforms** add-ons.

You can ask Metabot to generate a new SQL or Python-based transform, or edit an existing transform.

1. Go to **Data studio > Transforms**.
2. While in Transforms view, click on the Metabot icon in top right.
3. Describe the transform that you'd like Metabot to write.

   You can specify which kind of transform you want (Python or SQL) and @-mention specific data sources to help Metabot understand your request.

Metabot will create a to-do list for itself that will show its thinking process, and then work through the list.

You can continue working with Metabot to refine your code. Metabot will suggest code changes, and give you the option of accepting or rejecting the changes.

## Edit a transform

_Data Studio > Transforms_

You can edit the transform's name and description, query/script, target table, and incremental settings. You can edit the transform even if it already ran or is scheduled to run.

If you're using remote sync, you won't be able to edit transforms if your instance is in ["read-only" sync mode](../../installation-and-operation/remote-sync.md).

### Edit transform's query or script

_Data Studio > Transforms > Definition_

To edit the transform's query or script:

1. Make sure you have [permissions to edit transforms](../../permissions/data.md).
2. Go to **Data Studio > Transforms**.
3. Find the transform you'd like to edit and click on "Edit definition" above the transform definition.
4. Edit the query or script.

   See [query-based transforms](query-transforms.md) and [Python transforms](python-transforms.md) for more information. You can [use Metabot](#use-metabot-to-generate-code-for-transforms) to help edit your transform.

Once you change the transform's query or script, the next transform run (manual or scheduled) will use the updated query and write the results into the target table. If you've changed the table's columns, and you have questions that query the table, they might break. For example, if your new transform query no longer includes a column that a downstream question was relying on, that question will break.

### Edit transform's target

_Data Studio > Transforms > Settings_

To edit transform's target table, i.e., the table where the query results are written, go the transforms **Settings** tab and click on **Change target**. You'll need to select whether you want to keep the old target table, or delete it. Deletion can't be undone.

**Questions built on the old target will _not_ be transferred to the new target table.** If you delete the old target table, any questions using the old transform target table will break. If you keep the old target around, the questions built on it won't break but they will _not_ use the new target table, and so will become outdated.

## Run a transform

You can run a transform manually or schedule the transform using tags and jobs.

Running a transform for the first time will create and sync the table created by the transform, and you'll be able to edit the table's [metadata](../../data-modeling/metadata-editing.md) and [permissions](../../permissions/data.md). Subsequent runs will drop and recreate the table, unless you use [Incremental transforms](#incremental-transforms).

To run a transform manually, visit the transform in **Data Studio > Transforms > Runs** and click **Run**.

To schedule a transform, you'll need to assign one or more tags to it, then create a [scheduled job](./jobs-and-runs.md) that picks up those tags.

You can see the time and status of the latest transform run on the transform's page, or in the [Runs view](./jobs-and-runs.md). The time of the run is given in the system's timezone.

For Python transforms, you'll also see the transform's execution logs.

## Transform dependencies

> Transform dependency graph is only available on Pro and Enterprise plans (both self-hosted and Metabase Cloud)

_Data Studio > Transforms > Dependencies_

Transform queries can use the data from other transforms, and query-based transforms can also reference Metabase questions and models. For example, you can have a transform that uses data from a `raw_events` table and writes to a `stg_events` table, and then create another transform that uses data from the `stg_events` table and writes to an `events` table.

Metabase will track transform dependencies and execute transforms in a reasonable order. So for example, if transform B relies on a table created by transform A, Metabase will run transform A first, then run transform B.

On Metabase Pro or Enterprise plans, you can see the transform dependencies graph by going to **Data Studio > Transforms** and go to **Dependencies** tab.

If a job includes a transform that depends on a table created by another transform, then the job will run all the tagged transforms and their dependencies, even if they lack tags, see [Jobs and runs](jobs-and-runs.md) for more information.

### Incremental transforms

_Data Studio > Transforms > Settings_

Incremental transforms only append new data since the previous transform run. For example, you might have new transaction data coming in every day, and run the transform nightly. With each run, the incremental transform would only write the rows added after the previous run the night before.

### Prerequisites for incremental transforms

- There is a column in your data that Metabase can check for new values to determine which data is new. We'll refer to this as a "Checkpoint" column.
- The checkpoint column has to have increasing values, like a sequential ID or timestamp column. Metabase will determine what "new" data is by looking for values that are _greater than_ already-written checkpoint values.
- The checkpoint column should be present in both input and output table.
- Your schema is stable, meaning that the structure of the tables is not going to change from run to run.

### Make a transform incremental

Incremental transforms work differently for query-based transforms and Python transforms, so see [incremental query transforms](query-transforms.md#incremental-query-transforms) and [incremental Python transforms](./python-transforms.md#incremental-python-transforms) for more information.

## Versioning transforms

_Admin settings > General > Remote sync_

You can check your transforms into git with [Remote Sync](../../installation-and-operation/remote-sync.md). If you enable transform sync, Metabase will serialize transforms as YAML files and push them to your specified GitHub repo branch.

To enable git sync of transforms:

1. Go to Admin settings by click on the **grid** icon in top right and select **Admin**.
2. On the **General** tab, pick **Remote sync** in the left sidebar.
3. Follow the steps to [Set up Remote Sync](../../installation-and-operation/remote-sync.md), and toggle "Transforms" sync on.

Keep in mind that this setting only controls whether transforms are checked _into_ the git repo. The transform sync setting does _not_ affect how the instance behaves in read-only mode. If your instance is in read-only mode, you will not be able to create or edit transforms.

## Transforms vs models

Transforms are similar to models with model persistence turned on, but there are a few crucial differences:

- Transforms can only be created by [analysts with transform permissions](../../permissions/data.md). Models can be created by anyone with permissions to create queries on the data source (but only admins can enable model persistence on an instance).
- You can choose the target schema and tables for transforms. Model persistence will create its own schema and tables.
- Transforms support more databases than model persistence.
- You can use Python to create transforms.

Use models to enable non-admins to create their own datasets within Metabase, and to add context like field descriptions and semantic types. Use transforms to create persisted datasets in your database and reuse them across Metabase. In future version of Metabase, model persistence will be deprecated in favor of transforms.

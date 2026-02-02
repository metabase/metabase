---
title: Transforms
summary: Transforms allow you to wrangle your data in Metabase, write the query results back to your database, and reuse them in Metabase as sources for new queries.
---

# Transforms

{% include plans-blockquote.html feature="Transforms" is_plural=true%}

_Admin settings > Transforms_

Transforms can be used to, well, transform your data - do stuff like preprocessing, cleaning, joining tables, pre-computing metrics. Transforms give you the ability to do the "T" of "ETL" within Metabase.

You'll write a query or a Python script in Metabase, a transform will run this query or script, create a table in your target database containing the results, and sync that table to Metabase, so it can be used as a data source for questions or other transforms.

## Transforms overview

- **Transforms** are queries (either with SQL or the query builder) or Python scripts that write back to your database as a new, persistent table. Use transforms to clean, join, or pre-aggregate data.
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

You can't create transforms on databases that have [Database routing](../permissions/database-routing.md) enabled, on Metabase [Cloud Storage](../cloud/storage.md), or on Metabase's Sample Database.

Transforms will create tables in your database, so the database user you use for your connection must have appropriate privileges. See [Database users, roles, and privileges](../databases/users-roles-privileges.md).

## Types of transforms

Metabase supports two types of transforms: query-based transforms and Python transforms. Here's a high-level overview of how they work and the differences between them:

### Query-based transforms

- In Metabase, you create a `SELECT` query either using SQL or Metabase's [graphical query builder](../questions/query-builder/editor.md).
- When the transform first runs, your _database_ executes the transform's query.
- Your database writes the results of the query as a new table.
- The new table is synced to Metabase.
- On subsequent transform runs, your database will overwrite that table with the updated results (updates are not incremental).

### Python-based transforms

Python-based transforms require a dedicated Python execution environment, so you'll need to buy the Python execution add-on.

- In your Metabase, you write a Python script that returns a `pandas` DataFrame and uses one or more tables from your database.
- When Metabase runs the transform, a new Python execution environment is spun up. Python transforms run in a separate, isolated environment—not on your Metabase instance.
- Metabase securely copies your source data to your Python environment and makes it available as pandas DataFrames.
- The Python environment executes your Python script _in memory_.
- The Python environment saves the resulting DataFrame as a file.
- Your Metabase instance reads the file and writes the results to a new table in your database.
- The new table is synced to Metabase.
- On subsequent transform runs, your database will overwrite that table with the updated results (updates are not incremental).

For more on Python transforms, see [Python transforms](python-transforms.md).

## Create a transform

Only admins can create transforms.

To create a transform:

1. Go to Admin settings > Transforms.
2. Click **+ Create transform**.
3. Select the source for your transform.

   You can create transforms using the query builder, SQL editor, or by copying an existing question or model. On Metabase Cloud with the Python execution add-on, you can also [create transforms from a Python script](python-transforms.md). See [Types of transforms](#types-of-transforms).

   If you select a question for the transform's source, Metabase will only _copy_ the question's query. Later edits to that question won't affect the transform's query.

   Your transform can use the target tables of other transforms.

4. Edit the query or the Python code for the transform.

   In SQL transforms, you can reference other saved questions and use snippets, but you can't use SQL parameters.

   When editing query-based transforms, you can preview results without writing data into your database.

   For editing Python transforms, see [Python transforms](python-transforms.md).

5. Click **Save** in the top right corner.
6. Select a target schema for your transform and enter a name for the target table. Metabase will write the results of the transform into this table.

   You can only transform data _within_ a database; you can't write from one database to another.

7. Optionally, assign tags to your transforms. Tags are used by [jobs](#jobs-and-tags) to run transforms on schedule.

## Edit a transform

You can edit the transform's name and description, query or script, and target table. You can edit the transform even if it already ran or is scheduled to run.

### Edit transform's query or script

To edit the transform's query or script, click on "Edit query" or "Edit script" above the transform definition.

Currently, you can't convert between different transform types (e.g. a query builder transform to a SQL-based transform, or a SQL transform into a Python transform). If you want to change your transform built with the query builder into a SQL transform, you'll need to create a new transform with the same target and tags, and delete the old transform.

Once you change the transform's query or script, the next transform run (manual or scheduled) will use the updated query and write the results into the target table. If you have questions that query the transform's target table, they might break. For example, if your new transform query no longer includes a column that a downstream question was relying on, that question will break.

### Edit transform's target

To edit transform's target table, i.e., the table where the query results are written, click on "Change target". You'll need to select whether you want to keep the old target table, or delete it. Deletion can't be undone.

### Edit transform's name or description

To edit a transform's name or description, click on the name or description at the top of the transform page.

## Run a transform

You can run a transform manually or on schedule (e.g., hourly).

Running a transform for the first time will create and sync the table created by the transform, and you'll be able to edit the table's [metadata](./metadata-editing.md) and [permissions](../permissions/data.md). Subsequent runs will drop and recreate the table. Currently, Metabase doesn't support incremental transforms. Each transform run will recreate the target table using the entirety of the query results.

To run a transform manually, visit the transform and click **Run transform**.

To schedule a transform, you'll need to assign one or more tags to it, then create a [scheduled job](#jobs-and-tags) that picks up those tags.

You can see the time and status of the latest transform run on the transform's page, or in the Runs view. The time of the run is given in the system's timezone.

For Python transforms, you'll also see the transform's execution logs.

## Transform dependencies

Transform queries can use the data from other transforms. For example, you can have a transform that uses data from a `raw_events` table and writes to a `stg_events` table, and then create another transform that uses data from the `stg_events` table and writes to an `events` table.

Metabase will track transform dependencies, and execute them in order. For each transform, you can see which transforms the current transform depends on.

If a [job](#jobs-and-tags) includes a transform that depends on a table created by another transform, then the job will run all the tagged transforms and their dependencies, even if they lack tags.

## Jobs and tags

Jobs let you run multiple transforms on a schedule.

You can see and filter the list of all jobs, their last and next run, and the status of the least run, in _Admin settings > Transforms > Jobs_

To create a new job, go to _Admin settings > Transforms_, switch to the **Jobs** view, and click **Create a job**

To edit a job, click on the job in the list of jobs.

Jobs have two components: schedule and tags.

Metabase uses tags to locate transforms that should be run by the job, and then schedules those transforms according to the cron schedule. The times are given in the system's timezone.

### Tags

Job can use multiple tags, in which case, the job will run all transforms that have _any_ of those tags. For example, you can have a job "Weekend job" that is scheduled run at noon on Saturdays and Sundays that picks up all transforms tagged either "Saturday", "Sunday", or "Weekend".

By default, Metabase comes with hourly, daily, weekly, and monthly tags and jobs that are run on the corresponding schedules, but you can remove or rename those tags, or create new tags.

To create a new tag, just type the new tag's name in "Tags" field (either when viewing a transform or when viewing a job) and select "Create a tag".

### Jobs take dependencies into account

Depended transforms will be scheduled and run intelligently: if Transform B depends on the output of Transform A, then a job will run Transform A before Transform B. A job will run all dependent transforms even if the dependencies aren't tagged. You will see the order of transform execution on the job's page.

## Versioning transforms.

See [Remote sync](../installation-and-operation/remote-sync.md).

## Transforms vs models

Transforms are similar to models with model persistence turned on, but there are a few crucial differences:

- Transforms can only be created by admins. Models can be created by anyone with permissions to create queries on the data source (but only admins can enable model persistence).
- You can choose the target schema and tables for transforms. Model persistence will create its own schema and tables.
- You can't rename columns in a transform (but you can change column metadata once they're synced back to Metabase). You can rename columns in model metadata and then persist those column names using model persistence.
- Transforms support more databases than model persistence
- On Metabase Cloud with Python execution add-on, you can use Python to create transforms.

Use models to enable non-admins to create their own datasets within Metabase, and to add context like field descriptions and semantic types. Use transforms to create persisted datasets in your database and reuse them across Metabase.

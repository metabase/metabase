---
title: Transforms
summary: Transforms allow you to transform your data in Metabase, write the query results back to your database, and reuse them in Metabase as sources for new queries.
---

# Transforms

{% include plans-blockquote.html feature="Transforms" is_plural=true%}

_Admin settings > Transforms_

Transforms can be used to, well, transform your data - do stuff like preprocessing, cleaning, joining tables, pre-computing metrics. Transforms give you the ability to do the "T" of "ETL" within Metabase.

You'll write a query in Metabase, a transform will run this query, create a table in your target database containing the results, and sync that table to Metabase, so it can be used as a data source for questions or other transforms. You can schedule transforms to run periodically.

## Databases that support transforms

Currently, Metabase can create transforms on the following databases:

- BigQuery
- ClickHouse
- MySQL/MariaDB
- PostgreSQL
- Redshift
- Snowflake
- SQL Server

You can't create transforms on databases that have [Database routing](../permissions/database-routing.md) enabled, on Metabase [Cloud Storage](../cloud/storage.md), or on Metabase's Sample Database.

Transforms will create tables in your database, so the database user you use for your connection must have appropriate privileges. See [Database users, roles, and privileges](../databases/users-roles-privileges.md).

## Create a transform

Only admins can create transforms.

To create a transform:

1. Go to Admin settings > Transforms.
2. Click "+ Create transform".
3. Select the source for your transform. You can create transforms using the query builder, SQL editor, or by copying an existing question or model.

   If you select a saved question as a source, Metabase will copy the question's query but it will not retaining a reference to the saved question, so later edits to the question won't be reflected in the transform.

   You can use target tables of other transforms as source tables for your transform.

4. Edit the query in the query builder or the SQL editor.

   In SQL transforms, you can reference other saved questions and use snippets, but you can't use SQL parameters.

   When editing the query, you can run the query to preview the results. Previewing query results will not write data into your database.

5. Once you're done with the query, click "Save" in the top right corner.
6. Select a target schema for your transform and enter the name of the target table. Metabase will write the results of the transform query into this table.

   You can only write the results to the same database that you used as the source database for the query.

7. Optionally, assign tags to your transforms. Tags are used by [jobs](#jobs-and-tags) to run transforms on schedule. By default, Metabase comes with hourly, daily, weekly, and monthly tags and jobs that are run on the corresponding schedules, but you can remove or rename those tags, or create new tags.

   To create a new tag, just type the new tag's name in "Tags" field and select "Create a tag".

## Edit a transform

You can edit the transform's name and description, query, and target table. You can edit the transform even if it's already ran or scheduled.

### Edit transform's query

To edit the transform's query, click on "Edit query" above the query definition.

Currently, you can't convert a transform built with the query builder into a SQL-based transform. If you want to change your transform built with the query builder into a SQL transform, you'll need to create a new transform with the same target and tags, and delete the old one.

Once you change the transform's query, the next transform run (manual or scheduled) will run the new query and write the results into the target table, Note that if you have questions that use the transform's target table as the source, they might break - for example, if your new transform query doesn't include a column that a downstream question was relying on.

### Edit transform's target

To edit transform's target table, i.e. the table where the query results is written, click on "Change target". You'll need to select whether you want to keep the old target table, or remove it

### Edit transform's name or description

To edit transform's name or description, click on the name or description at the top of the transform page.

## Run a transform

You can run a transform manually or on schedule (e.g. hourly).

Running a transform for the first time will create and sync the table created by the transform, and you'll be able to edit the table's [metadata](./metadata-editing.md) and [permissions](../permissions/data.md). Subsequent runs will drop and recreate the table. Currently, Metabase does not support incremental transforms. Each transform run will recreate the target table using the entirety of the query results.

To run a transform manually, click on "Run transform" while viewing the transform.

To schedule a transform, you'll need to assign one or more tags to it, then create a [scheduled job](#jobs-and-tags) that picks up those tags.

You can see the time and status of the latest transform run on the transform's page, or in Runs view. The time of the run is given in the system's timezone.

## Transform dependencies

Transform queries can use the data from other transforms. For example you can have a transform that uses data from `raw_events` table and writes to a `stg_events` table, and then another transform that uses data from `stg_events` table and writes to `events` table.

Metabase will recognize transform dependencies and use them to arrange transform execution. For each transform, you can see which transforms the current transform depends on.

If a [job](#jobs-and-tags) includes a transform that depends on an output of another transform, then it will runs all the tagged transforms and their dependencies, even if they are not tagged.

## Jobs and tags

Jobs let you run multiple transforms on a schedule.

You can see and filter the list of all jobs, their last and next run, and the status of the least run, in _Admin settings > Transforms > Jobs_

To create a new job, go to _Admin settings > Transforms_, switch to "Jobs" view, and click "Create a job"

To edit a job, click on the job in the list of jobs.

Jobs have two components: schedule and tags. Metabase uses tags to locate transforms that should be run by the job, and then schedules those transforms according to the cron schedule. The times are given in the system's timezone.

Job can use multiple tags, in which case, the job will run all transforms that have _any_ of those tags. For example, you can have a job "Weekend job" that is scheduled run at noon on Saturdays and Sundays that picks up all transforms tagged either "Saturday", "Sunday", or "Weekend".

Depended transforms will be scheduled and run intelligently: if Transform B depends on the output of Transform A, then a job will run Transform A before Transform B. A job will run all dependent transforms even if the dependencies aren't tagged. You will see the order of transform execution on the job's page.

Metabase comes with default tags and jobs for hourly, daily, weekly, and monthly scheduling. You can rename or delete those default jobs and tags.

## Transforms vs models and.model persistence

Transforms are similar to models with model persistence turned on, but there are a few crucial differences:

- Transforms can only be created by admins. Models can be created by anyone with permissions to create queries on the data source (but model persistence can only be enabled by admins)
- You can choose the target schema and tables for transforms. Model persistence will create its own schema and tables.
- You can't rename columns in a transform (but you can change their metadata once they're synced back to Metabase). You can rename columns in model metadata and then persist those column names using model persistence.
- Transforms support more databases than model persistence

Use models to enable non-admins to create their own datasets within Metabase, and to add context like field descriptions and semantic types. Use transforms to create persisted datasets in your database and reuse them across Metabase.

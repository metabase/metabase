---
title: Transforms
summary: Transforms allow you to
---

# Transforms

_Admin settings > Transforms_

Transforms can be used to, well, transform your data - do stuff like preprocessing, cleaning, joining tables, pre-computing metrics. You'll 'write a query in Metabase, a transform will run this query, create a table in your target database containing the results, and sync that table to Metabase, so it can be used as a data source for questions or other transforms. You can schedule transforms to run periodically.

## Databases that support transforms

Currently, Metabase can create transforms on the following databases:

- BigQuery
- ClickHouse
- MySQL/MariaDB
- PostgreSQL
- Redshift
- Snowflake
- SQL Server

You can't create transforms on databases that have [Database routing](../permissions/database-routing.md) enabled, on on Metabase's Sample Database.

Transforms will create tables in your database, so the database user you use for your connection must have appropriate privileges. See [Database users, roles, and privileges](../databases/users-roles-privileges.md).

## Create a transform

Only admins can create transforms.

You can create transforms using the query builder, SQL editor, or by copying an existing question or model.

To create a transform:

1. Go to Admin settings > Transforms.
2. Click "+ Create transform".
3. Select the source for your transform.
4. Edit the query in the query builder or the SQL editor.

   In SQL transforms, you can reference other saved questions and use snippets, but you can't use SQL parameters.

   When editing the query, you can run the query to preview the results. Previewing query results will not write data into your database.

5. Once you're done with the query, click "Save" in the rop right corner.
6. Select a target schema for your transform and enter the name of the target table. This will be the table where Metabase will write the results of the transform query.

   You can only write the results to the same database that you used as the source database for the query.

## Run a transform

You can also run a transform manually or on schedule. Running a transform

Currently, Metabase does not support incremental transforms. Each transform run will recreate the target table.

## Edit a transform

... You can choose to keep the old

## Schedule transforms

To schedule a tran

## Transform dependencies

## Jobs

Jobs let you run multiple transforms on a schedule.

## Transforms vs models

---
title: Query-based transforms
summary: Create Metabase questions and SQL queries to transform your data and write the results back into your data warehouse.
---

# Query-based transforms

> On Metabase Cloud, you need the Transforms add-on to run query-based transforms.

With query-based transforms, you can write a query in SQL or Metabase's query builder, and then write the results of the query back into the database on schedule.

For general information about Metabase transforms, see [Transforms](transforms-overview.md).

## How query-based transforms work

- In Metabase, you create a `SELECT` query either using SQL or Metabase's [graphical query builder](../../questions/query-builder/editor.md).
- When the transform first runs, your _database_ executes the transform's query.
- Your database writes the results of the query to a new table.
- The new table is synced to Metabase.
- On subsequent transform runs, your database will overwrite that table with the updated results unless you [configure your transform to be incremental](#incremental-query-transforms).

## Create a query-based transform

Currently, you can't convert between different transform types (like converting a query builder transform to a SQL-based transform, or a SQL transform into a Python transform). If you want to change your transform built with the query builder into a SQL transform, you'll need to create a new transform with the same target and tags, and delete the old transform.

1. Go to **Data studio > Transforms**

2. Click **+ New** and pick "Query builder", "SQL", or "Copy of existing question".

3. Write your transform query as you would normally write a query in Metabase. See [Query builder](../../questions/query-builder/editor.md) and [SQL editor](../../questions/native-editor/writing-sql.md) documentation for more information.

   Not all databases support transforms, see [Databases that support transforms](transforms-overview.md#databases-that-support-transforms).

4. To test your transform, press the "Run" button at the bottom of the editor.

   Previewing a query transform in the editor will _not_ write the result of the transform back to the database.

5. Click **Save** in the top right corner and fill out the transform information:

   - **Name** (required): The name of the transform.
   - **Schema** (required): Target schema for your transform. This schema can be different from the schema of the source table(s). You create a new schema by typing its name in this field. You can only transform data _within_ a database; you can't write from one database to another.
   - **Table name** (required): Name of the table where Metabase will write and enter a name for the target table. Metabase will write the results of the transform into this table, and then sync the table in Metabase.
   - **Folder** (optional): The folder where the transform should live. Click on the field to pick a different folder or create a new one.
   - **Incremental transformation** (optional): see [Incremental query transforms](#incremental-query-transforms)

6. Optionally, assign tags to your transforms. Tags are used by [jobs](jobs-and-runs.md) to run transforms on schedule.

## Run a query transform

See [Run a transform](transform-overview.md#run-a-transform). You'll see logs for a transform run on the transform's page.

## Incremental query transforms

By default, on every transform run after the first one, Metabase will process all the data in all input tables, then drop the existing target table, and create a new table with the processed data. You can tell Metabase to only write **new** data to your target table by marking you transform as incremental.

### Prerequisites for incremental transforms

Your data has to have certain structure for incremental transforms to work. See [Prerequisites for incremental transforms](transforms-overview.md#prerequisites-for-incremental-transforms).

### How incremental query transforms work

For transform to run incrementally, you'll need to pick a column ("checkpoint") that Metabase needs to check for new values. Then, behind the scenes, Metabase will add a filter around your transform query that will filter the results of the query for values greater than the last written checkpoint value.

### Make a query transform incremental

To make a query transform incremental:

1. Go to the transform's page in **Data studio > Transforms**.
2. Switch to **Settings** tab.
3. In **Column to check for new values**, select the column that Metabase should check to determine which values are new. See [Prerequisites for incremental transforms](./transforms-overview.md#prerequisites-for-incremental-transforms) for more information on the requirements for that column.

   You have to select the column from the list of the columns of the _output_ tables. Note: this is different from [Python transforms](python-transforms.md), where you select an _input_ column as column to check for new values.

   If you're using SQL, Metabase might tell you that your query is too complicated to automatically make the transform incremental. In this case, you need to add the filter for new values manually. For example, let's say you have a transform query:

   ```sql
   SELECT id, total FROM orders;
   ```

   (This query is actually simple enough for Metabase to handle it automatically, we're just using it as an example)

   If you want use the `id` column to check for new values, i.e. only write back the records with `id` greater than already existing `id`, you can add a manual filter like this:

   ```sql
   SELECT id, total FROM orders
   {%raw%}[[WHERE id > {{checkpoint}}]]{% endraw %}
   ```

   and then select `id` as the **Column to check for new values** in the incremental transform settings.

   If you're using a timestamp column as a checkpoint, you'll need to explicitly cast it to timestamp:

   ```sql
   SELECT created_at, total FROM orders
   {%raw%}[[WHERE created_at> {{checkpoint}}::timestamp]]{% endraw %}
   ```

---
title: Query-based transforms
summary: Create Metabase questions and SQL queries to transform your data and write the results back into your data warehouse
---

# Query-based transforms

You can use to transform the data from your database, and write the result back into the database as another table.

For general information about Metabase transforms, see [Transforms](transforms.md).

### How query-based transforms work

- In Metabase, you create a `SELECT` query either using SQL or Metabase's [graphical query builder](../questions/query-builder/editor.md).
- When the transform first runs, your _database_ executes the transform's query.
- Your database writes the results of the query as a new table.
- The new table is synced to Metabase.
- On subsequent transform runs, your database will overwrite that table with the updated results (updates are not incremental).

## Create a query-based transform

Currently, you can't convert between different transform types (e.g. a query builder transform to a SQL-based transform, or a SQL transform into a Python transform). If you want to change your transform built with the query builder into a SQL transform, you'll need to create a new transform with the same target and tags, and delete the old transform.

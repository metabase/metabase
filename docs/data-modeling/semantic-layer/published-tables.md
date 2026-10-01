---
title: Published tables
summary: Published tables are a part of Metabase semantic layer and serve as a curated, authoritative source of truth.
---

# Published tables

Published tables are special kind of tables that get surfaced as the default stating point for people's questions, prioritized by Metabot (when Metabot is configured appropriately), and whose metadata can be synced to git.

Tables published to the Library remain available via the data browser as well.

To publish a table to the library:

1. Go to **Data Studio > Semantic layer**
2.

### Managing tables

Once a table is published, you can view and manage its metadata, and more.

- Overview
- Fields
- [Segments](segments.md)
- [Measures](measures.md)
- [Dependencies](../tools/graph.md)

To query a table from the Library in Data Studio:

1. Click the table.
2. Click the three-dot menu.
3. Select **View**.

### Published tables can't have dependencies outside of the Library

Tables published to the Library can't depend on any tables outside of the Library. If, for example, you want to publish a table that includes data from another table, such as a [foreign-key remapping](../../questions/visualizations/table.md#foreign-key-remapping), Metabase will publish those tables as well.

### Unpublishing tables

![Unpublishing a table from the Library](./images/library-unpublish.png)

To unpublish a table from the Library:

1. Visit the table in Data Studio in the Library tab.
2. Click on the three-dot menu next to the table's name.
3. Click **Unpublish**.

If other tables depend on the table you want to unpublish, Metabase will unpublish those tables as well. You'll get a confirmation message explaining which tables Metabase would unpublish.

Unpublishing a table just removes the table from the Library. That table will still be available via the data browser and data pickers.

> **Archiving a subcollection unpublishes its tables.** If you archive a Data subcollection, Metabase will automatically unpublish all tables inside it, including tables in any nested subcollections.

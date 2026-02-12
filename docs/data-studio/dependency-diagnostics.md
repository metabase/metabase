---
title: Dependency diagnostics
summary: Find broken content and unused items so you can fix problems and clean up safely.
---

# Dependency diagnostics

Dependency diagnostics shows you content with broken dependencies, and content that isn't referenced by anything else.

To open Dependency diagnostics:

1. Open [Data Studio](./overview.md).
2. Click **Dependency diagnostics** in the left sidebar.

Dependency diagnostics has two tabs: **Broken dependencies** and **Unreferenced entities**.

## Broken dependencies

> Note: Broken dependency detection currently covers only questions built with the query builder (MBQL). SQL questions and SQL models aren't included.

Broken dependencies lists items that other content depends on, where a dependent item references a column or field the item no longer provides. This can happen when a column is removed or renamed, or when a field is hidden from the query builder by setting Visibility to [**Do not include**](../data-modeling/metadata-editing.md).

The broken dependencies table includes:

- Tables
- [Questions](../questions/introduction.md)
- [Models](../data-modeling/models.md)

For each item, the list shows:

- **Dependency**: The upstream item causing the issue
- **Location**: Where the item lives in your collections
- **Problems**: Missing columns detected for this item
- **Broken dependents**: Downstream items that break because they reference those missing columns

Metabase only shows items when you have access to both the source item and at least one broken dependent, and neither item is archived.

### View details for a broken item

Selecting an item opens a details panel with:

- The item's name, owner, and creation date
- A list of missing or invalid columns, with copy buttons to help fix references
- Downstream items that are broken because of this specific issue. You can filter this list by entity type
- Quick links to open items or view them in the [dependency graph](./dependency-graph.md)

For tables created by transforms, the sidebar also shows a link to the source transform.

### Why an item can still run but show up here

Some items show up as broken even though they still return results. The query runs, but parts of it no longer line up cleanly with the current data structure.

This usually happens for one of the following reasons.

**Unknown field after a data source change**

Older queries may reference columns that Metabase can no longer clearly resolve, often because the data source, table, or schema changed. In the query builder, these appear as Unknown field.

To fix this, open the item and replace the Unknown field with the correct column from the current table or model.

**Downstream breakage after SQL output changes**

Another common case is when a SQL question or SQL model changes the columns it returns. Items built on top of it using the notebook editor may still run, but they rely on column names that no longer match the SQL output and are therefore considered broken.

To fix this, either restore the expected column names in the SQL query or update the affected items to use the new column names. You can use the dependency graph to find everything impacted.

## Unreferenced entities

Unreferenced entities shows items that aren't used by any other non-archived content. Use this view to clean up unused content, especially reusable items like models, metrics, and snippets. Start by checking why an item was created, when it was last edited, and whether it was meant to be reused.

An unreferenced item isn't broken and isn't automatically safe to delete. It simply means nothing else depends on it. Check [Usage analytics](../usage-and-performance-tools/usage-analytics.md) for view activity before you archive or delete an item.

The Unreferenced entities list is limited to what you can access, so an item can show up as unreferenced even if something you can’t see depends on it.

Unreferenced entities includes:

- Tables
- [Questions](../questions/introduction.md)
- [Models](../data-modeling/models.md)
- [Metrics](../data-modeling/metrics.md)
- Segments
- Measures
- [Snippets](../questions/native-editor/snippets.md)

For each item, the list shows:

- **Name**: The item's title
- **Location**: Where the item lives in your collections

### Viewing unreferenced item details

Selecting an item opens a details panel with:

- Who created the item and when
- When it was last edited
- Links to open the item or view it in the [dependency graph](./dependency-graph.md)

For tables, the sidebar also shows owners, descriptions, and links to open the schema or database. For tables created by transforms, the sidebar shows a link to the source transform.

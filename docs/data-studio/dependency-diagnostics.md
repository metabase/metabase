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

It currently detects issues only for questions built with the query builder (MBQL). SQL questions and SQL models aren't included.

### Viewing details for a broken item

Selecting an item opens a details panel with:

- The item's name, owner, and creation date
- A list of missing or invalid columns, with copy buttons to help fix references
- Downstream items that are broken because of this specific issue. You can filter this list by entity type
- Quick links to open items or view them in the [dependency graph](./dependency-graph.md)

For tables created by transforms, the sidebar also shows a link to the source transform.

### Why an item can still run but show up here

Broken dependencies flags unresolved field references. An item can still run even if it shows up here.

A common case is **Unknown field** in the query builder. This can happen when content was created in older versions and later had its data source changed. Replace the **Unknown field** to fix the reference.

Another common case is downstream MBQL questions breaking because a SQL question or SQL model changed the columns it returns.

## Unreferenced entities

Unreferenced entities shows items that aren't used by any other non-archived content.

Use Unreferenced entities to clean up unused content, especially reusable items like models, metrics, and snippets.

An unreferenced item isn't broken and isn't automatically safe to delete. It simply means nothing else depends on it.

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

If an item is used by content you don't have access to, it may appear as unreferenced even though it's actually in use elsewhere.

### Viewing unreferenced item details

Selecting an item opens a details panel with:

- Who created the item and when
- When it was last edited
- Links to open the item or view it in the [dependency graph](./dependency-graph.md)

For tables, the sidebar also shows owners, descriptions, and links to open the schema or database. For tables created by transforms, the sidebar shows a link to the source transform.

---
title: Dependency graph
summary: Visualize how your content connects and what depends on what in Metabase.
---

# Dependency graph

The dependency graph provides a visual representation of how your Metabase content is connected. You can use it to follow how data flows through your Metabase to better understand the impact of any changes you make.

## What the dependency graph tracks

The dependency graph tracks the relationships between:

- Tables
- [Questions](../questions/introduction.md)
- [Models](../data-modeling/models.md)
- [Snippets](../questions/native-editor/snippets.md)
- [Transforms](../data-modeling/transforms.md)
- [Metrics](../data-modeling/metrics.md)
- [Dashboards](../dashboards/introduction.md)
- [Documents](../documents/introduction.md)

## Viewing the dependency graph

To open the full dependency graph:

1. Open [Data Studio](./overview.md).
2. Click **Dependency graph** in the left sidebar.

This opens a canvas view where you can search for and visualize the dependencies of any item across your entire Metabase instance.

You can also view the dependency graph from any item in Data Studio by switching to the Dependencies tab.

## What the dependency graph shows

The dependency graph shows both the content an item relies on and the content that relies on it, displayed as connected items you can explore.

Each item in the graph shows:

- Type (table, model, question, etc.)
- Name
- Dependent counts showing how many other items rely on it

These counts show how important an item is. Items with many dependents usually need extra care before making changes.

### Viewing dependent details

You can click any dependent count to open a details panel on the right, where you can:

**Search**

- Find items by name
- See each item’s title and collection location

**Filter**

- Verified items
- Items in dashboards
- Items in official collections
- Items not in personal collections

**Sort**

- Name
- Location
- View count

Sorting by view count helps you see which dependents are used most often.

## How Metabase finds dependencies

Metabase determines dependencies by analyzing how items are constructed and reused, not just by tracing their immediate data source.
It inspects things like:

- Query structure and joins
- References to other questions or models
- How items are used in dashboards, filters, and other content

Because of this, dependencies can exist even when no data is directly queried. For example:

- A SQL question may depend on another GUI question it queries
- A question used only to populate a dashboard filter dropdown still counts as a dependency
- Questions that are joined together may appear as separate dependent items

Some dependencies are inferred rather than explicitly defined. SQL queries can introduce implicit joins, and complex questions may have multiple internal dependency paths instead of a single source to result flow. As a result, a dependency may appear in the graph even if it’s not obvious from the question editor.

If a dependency looks unexpected, it usually reflects an indirect or inferred relationship. In those cases, review how the item is used before changing or removing it.

## Further reading

- [Library](./library.md)

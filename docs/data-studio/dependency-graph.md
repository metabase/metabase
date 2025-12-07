---
title: Dependency graph
---

# Dependency graph

The dependency graph provides a visual representation of how your Metabase content connects together. It maps the relationships between tables, models, snippets, transforms, questions, metrics, dashboards, and documents, so you can follow how data flows and understand the impact of any changes.

## Accessing the dependency graph

To open the full dependency graph:

1. Go to **Settings** > **Data Studio**.
2. Click **Dependency graph** in the left sidebar.

This opens a canvas view where you can search for and visualize the dependencies of any item across your entire Metabase instance.

You can also view the dependency graph from any item in Data Studio by switching to the Dependencies tab.

## Understanding the graph

**Dependency types**

The graph shows two types of relationships:

**Upstream dependencies** are the items your selection relies on.

For example, a question’s upstream dependencies might include the table it queries, the models it references, or SQL snippets it uses.

**Downstream dependents** are the items that rely on your selection.

For a table, this might include questions built on it, models that reference it, and dashboards that include those questions

Each item in the graph shows:

- Type (table, model, question, etc.)
- Name.
- Dependent counts showing how many other items rely on it.

These counts make it easy to see how important an item is. Items with many dependents usually need extra care before making changes.

You can click any dependent count to open a details panel on the right, where you can:

**Search**

- Find items by name.
- See each item’s title and collection location.

**Filter**

- Verified items.
- Items in dashboards.
- Items in official collections.
- Items not in personal collections.

**Sort**

- Name.
- Location.
- View count.

Sorting by view count helps you see which dependents are used most often.

---
title: Dependency graph
---

# Dependency graph

The dependency graph shows how tables, models, transforms, questions, metrics, and dashboards relate to each other. It helps you understand what an item depends on, and what will be affected if you change or delete it.

## Accessing the dependency graph

To open the dependency graph:

1. Go to **Settings** > **Data Studio**.
2. Click **Dependency graph** in the left sidebar.

 This opens the canvas view where you can search for any table, model, transform, question, metric, or snippet.

You can also view the dependency graph directly from items in the Data, Modeling, or Transforms sections by switching to the Dependencies tab.

## What the graph shows

The graph shows two relationships: **upstream dependencies**, which are the entities your selected entity relies on, and **downstream dependents**, which are the entities that rely on it. Dependencies can come from direct references in queries, joins, transform outputs, SQL snippets, or dashboards that include questions. Each entity in the graph displays how many dependents it has, shown as counts of questions, metrics, dashboards, and snippets.

Click any of these counts to open a panel on the right with the full list of dependent items. The panel lets you search by name, filter the list by properties like Verified status, whether the item is in a dashboard, in an official collection, or not in a personal collection, and sort the results by name, location, or view count.

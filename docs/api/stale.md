---
title: "Stale"
summary: |
  API endpoints for retrieving or archiving stale (unused) items.
    Currently supports Dashboards and Cards.
---

# Stale

API endpoints for retrieving or archiving stale (unused) items.
  Currently supports Dashboards and Cards.

## `GET metabase-enterprise.stale.api/:id`

A flexible endpoint that returns stale entities, in the same shape as collections/items, with the following options:
  - `before_date` - only return entities that were last edited before this date (default: 6 months ago)
  - `is_recursive` - if true, return entities from all children of the collection, not just the direct children (default: false)
  - `sort_column` - the column to sort by (default: name)
  - `sort_direction` - the direction to sort by (default: asc).

### PARAMS:

-  **`id`** value must be an integer greater than zero., or must equal :root.

-  **`before_date`** nullable string.

-  **`is_recursive`** boolean.

-  **`sort_column`** nullable enum of :name, :last_used_at.

-  **`sort_direction`** nullable enum of :asc, :desc.

---

[<< Back to API index](../api-documentation.md)
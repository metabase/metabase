---
title: Data Editing
---

# Data Editing in Data Studio

## Table overview

## Editing table metadata

### Sync settings

Clicking the **Sync settings** button opens a popover that allows you to perform the following operations on your database table:

- **Re-sync schema** scans the database table again for any changes you've made to the table's schema since the last sync.
- **Scan field values** scans the actual values in your table to populate filters on dashboards.
- **Discard cached field values**

### Dependency graph

Clicking the graph icon opens up the dependency graph for your table, which shows which tables, models, and transforms it depends on, and which depend on it.

For more information on the dependencies graph, see [Dependency graph](../data-studio/dependency-graph.md).

### Attributes

**Owner.**

**Visibility type.** The options are based on the [Medallion Architecture for data pipelines](https://www.databricks.com/glossary/medallion-architecture), which defines three levels of data aggregation and processing: bronze, silver, and gold (and we have added copper as well).

**Entity type.**

**Source.**

### Metadata

- **Name on disk**
- **Last updated at**
- **View count**
- **Dependencies**
- **Dependents**

### Fields

## Bulk editing

### Search and filtering

Search options

Filter by visibility type, owner, and source

Click **Apply** to apply the filter and see the result

### Multi-select databases and tables

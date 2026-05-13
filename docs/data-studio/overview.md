---
title: Data studio
summary: Data Studio provides tools to shape and track your data so everyone can trust the numbers.
redirect_from:
  - /docs/latest/data-studio/start
---

# Data Studio

![Data Studio](./images/data-studio.png)

Data Studio provides tools to shape and track your data so everyone can trust the numbers.

- **Create an easy-to-understand semantic layer** to match how people think about your business.
- **Speed up queries** by transforming tables to anticipate usage patterns.
- **View dependency graphs** to identify and fix problems before they impact reports.

## What's in Data Studio

- **[Library](./library.md)**\*: A curated space for your organization's most trusted analytics content—tables, metrics, and SQL snippets that your data team recommends.
- **[Managing tables](./managing-tables.md)**: Add table metadata to make tables easier to work with.
- **[Segments](./segments.md)**: Create saved filters on tables so people can use consistent definitions when building queries.
- **[Measures](./measures.md)**: Create saved aggregations on tables so people can use consistent calculations when building queries.
- **[Glossary](../exploration-and-organization/data-model-reference.md#glossary)**: Define terms relevant to your business, both for people and agents trying to understand your data.
- **[Dependency graph](./dependencies/graph.md)**\*: A visual map of how your content connects, so you can understand the impact of changes before you make them.
- **[Dependency diagnostics](./dependencies/diagnostics.md)**\*: See which items have broken dependencies, or that aren't used.
- **[Replace data sources](./dependencies/replace-data-sources.md)**\*: Swap out a table or model across all content that uses it, in one operation.
- **[Transforms](./transforms/transforms-overview.md)**: Wrangle your data in Metabase, write the query results back to your database, and reuse them in Metabase as sources for new queries.

\* Available on [Pro and Enterprise plans](https://www.metabase.com/pricing/).

## Permissions for Data Studio

The keys to Data Studio are granted only to people in either the Admin or [Data Analysts](../people-and-groups/managing.md#data-analysts) groups.

There are additional permissions required to run transforms, see [Permissions for transforms](./transforms/transforms-overview.md#permissions-for-transforms).

## Get to Data Studio

1. Click the **grid** icon in the upper right.
2. Select **Data Studio**.

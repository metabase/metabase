---
title: "Data modeling overview"
redirect_from:
  - /docs/latest/data-modeling
---

# Data modeling overview

Metabase provides tools for organizing your data and making it easier for people to understand. You can use Metabase to:

- [Transform your data into shape appropriate for analytics](transforms/transforms-overview.md);
- [Create authoritative, validated data sources](semantic-layer/library.md);
- [Build a semantic layer to standardize definitions and metrics for people and AI](semantic-layer/metrics.md);
- [Track lineage and dependencies of data and queries](tools/graph.md);
- [Configure metadata, formatting, and display options for columns and tables](metadata/metadata-editing.md).
- [Swap data sources in bulk](tools/replace-data-sources.md)

## [Data Studio](data-studio.md)

[Data Studio](data-studio.md) is a set of tools to shape and surface the data your analytics depends on. You can use Data Studio to transform data, build your semantic layer, and track data lineage.

## [Transforms](transforms/transforms-overview.md)

Use [Transforms](transforms/transforms-overview.md) to pre-process, clean, and shape your data, then write the results back into your database on a schedule.

You can write transforms in [SQL](transforms/query.md) or [Python](transforms/python.md), create [scheduled data pipelines](transforms/jobs-and-runs.md), and [inspect results of transforms](transforms/inspector.md).

## Metadata

Use table settings and metadata to make it easier for people to work with your data: [configure table visibility, types, and owners](metadata/managing-tables.md), [edit table and column descriptions](metadata/metadata-editing.md), [configure filter and display settings for columns](metadata/metadata-editing.md), [set formatting defaults](metadata/formatting.md).

## Semantic layer

Create standard, curated data sources, definitions, and metrics to help both people on your team and AI understand your data. - aka the semantic layer The [Library](./semantic-layer/library.md) is a place to curate company-wide authoritative tables and [metrics](semantic-layer/metrics.md) that you want people to use to start their own explorations. [Measures](semantic-layer/measures.md) and [segments](semantic-layer/segments.md) are saved calculations and saved filters, respectively, that people can use instead of reinventing "ARR" or "Active users" in every query. The [Glossary] is the place to define your business-specific terms

## [Dependency graph](tools/graph.md)

Track where every number on every chart comes from. The [dependency graph](tools/graph.md) traces lineage through transforms, questions, measures and segments, metrics, and dashboards.

## [Schema viewer](tools/schema-viewer.md)

The entity-relationship diagram for your database.

## [Replace data sources](tools/replace-data-sources.md)

Bulk-replace a table/model/question with another one across your entire Metabase.

## [Editable tables](editable-tables.md)

With [editable tables](editable-tables.md), Admins can edit data in tables directly from Metabase.

## [Models](models/models.md)

> Consider using [Transforms](transforms/transforms-overview.md) instead of models.

Models curate data from another table or tables from the same database to anticipate the kinds of questions people will ask of the data. You can think of them as a special kind of saved question meant to be used as the starting point for new questions.

---
name: serialization-format
description: Generate and understand Metabase serialized YAML data for export/import across instances
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Metabase Serialization Format

This skill enables generating valid Metabase serialized YAML files from scratch, without needing a running Metabase instance. Use it when you need to create, modify, or understand Metabase serialization exports.

## Overview

Metabase serialization (SerDes) exports instance configuration as a tree of YAML files. Each file represents one entity (a collection, card, dashboard, database definition, etc.). The format is designed to be **portable** across Metabase instances: numeric database IDs are replaced with human-readable names and entity IDs.

The source of truth for what gets serialized is `serdes/make-spec` in each model file. The spec declares:
- **`:copy`** fields -- written to YAML as-is
- **`:transform`** fields -- converted to portable form (e.g., numeric FK to entity_id)
- **`:skip`** fields -- excluded from serialization

For the full YAML spec per entity type, see [reference.md](./reference.md).

## Entity IDs (NanoID)

Every serializable entity has an `entity_id` -- a 21-character [NanoID](https://github.com/ai/nanoid) string like `NDzkGoTCdRcaRyt7GOepg`. This is the primary portable identifier used in cross-references.

Generate a NanoID in Python:
```python
from nanoid import generate
generate()  # => 'NDzkGoTCdRcaRyt7GOepg'
```

NanoID alphabet: `A-Za-z0-9_-` (64 chars, 21 chars long).

**Rules:**
- Every entity you create must have a unique `entity_id`.
- Once assigned, an entity_id must **never change** -- it is the entity's permanent identity across instances.
- When one entity references another, it uses the target's `entity_id` (not a numeric ID).

**Exceptions** -- some entities use natural keys instead of NanoIDs:
- **Database**: identified by `name` (e.g., `"Sample Database"`)
- **Table**: identified by `[database_name, schema, table_name]` (e.g., `["Sample Database", "PUBLIC", "ORDERS"]`)
- **Field**: identified by `[database_name, schema, table_name, field_name]`
- **Schema**: identified by name within a database
- **Setting**: identified by setting key
- **Glossary**: identified by `term`

## `serdes/meta`

Every YAML file contains a `serdes/meta` key -- an array of path segments identifying the entity:

```yaml
# Simple entity (Card, Dashboard, Collection, etc.)
serdes/meta:
- id: f1C68pznmrpN1F5xFDj6d    # entity_id
  label: some_question            # slug for filename
  model: Card                     # model name

# Nested entity (Field within Table within Database)
serdes/meta:
- id: Sample Database
  model: Database
- id: PUBLIC
  model: Schema
- id: ORDERS
  model: Table
- id: PRODUCT_ID
  model: Field
```

The `label` field is used in the filename. It is a slugified version of the entity name (lowercase, spaces replaced with underscores, truncated to 100 chars).

## Folder Structure

```
export-root/
├── settings.yaml                          # Global Metabase settings (flat key-value map)
│
├── collections/                           # All content organized by collection hierarchy
│   ├── {entity_id}_{slug}/                # A collection folder
│   │   ├── {entity_id}_{slug}.yaml        # The collection's own definition
│   │   ├── cards/                          # Questions and models in this collection
│   │   │   └── {entity_id}_{slug}.yaml
│   │   ├── dashboards/                     # Dashboards in this collection
│   │   │   └── {entity_id}_{slug}.yaml
│   │   ├── timelines/
│   │   │   └── {entity_id}_{slug}.yaml
│   │   ├── transforms/                     # Transforms in this collection
│   │   │   └── {entity_id}_{slug}.yaml
│   │   ├── metabots/
│   │   │   └── {entity_id}.yaml
│   │   ├── documents/
│   │   │   └── {entity_id}_{slug}.yaml
│   │   └── {child_entity_id}_{slug}/       # Nested child collection
│   │       ├── {child_entity_id}_{slug}.yaml
│   │       └── cards/
│   │           └── ...
│   │
│   ├── cards/                              # Cards in root collection (no parent)
│   │   └── {entity_id}_{slug}.yaml
│   ├── dashboards/                         # Dashboards in root collection
│   │   └── {entity_id}_{slug}.yaml
│   ├── transforms/                         # Transforms in root collection
│   │   └── {entity_id}_{slug}.yaml
│   ├── metabots/
│   │   └── {entity_id}.yaml
│   └── channels/
│       └── {name}_{slug}.yaml
│
├── databases/                              # Database metadata (schema, tables, fields)
│   └── {database_name}/
│       ├── {database_name}.yaml            # Database definition
│       ├── schemas/                         # If database has schemas
│       │   └── {schema_name}/
│       │       └── tables/
│       │           └── {table_name}/
│       │               ├── {table_name}.yaml
│       │               ├── fields/
│       │               │   ├── {field_name}.yaml
│       │               │   ├── {field_name}___fieldvalues.yaml
│       │               │   └── {field_name}___fieldusersettings.yaml
│       │               ├── segments/
│       │               │   └── {entity_id}_{slug}.yaml
│       │               └── measures/
│       │                   └── {entity_id}_{slug}.yaml
│       └── tables/                          # If database is schemaless
│           └── {table_name}/
│               ├── {table_name}.yaml
│               └── fields/
│                   └── ...
│
├── actions/                                # Top-level actions
│   └── {entity_id}_{slug}.yaml
│
├── glossary/                               # Glossary terms
│   └── {term}.yaml
│
├── python-libraries/                       # Shared Python code for transforms
│   └── {entity_id}.yaml
│
├── snippets/                               # Native query snippets (mirror collection structure)
│   ├── {entity_id}_{slug}.yaml
│   └── {collection_entity_id}_{slug}/
│       └── {entity_id}_{slug}.yaml
│
└── transforms/                             # Transform scheduling infrastructure
    ├── transform_tags/
    │   └── {entity_id}_{slug}.yaml
    └── transform_jobs/
        └── {entity_id}_{slug}.yaml
```

### Path construction rules

- **Collection hierarchy is reflected in directory nesting.** A child collection folder lives inside its parent collection folder.
- **Entity files are named `{entity_id}_{label}.yaml`** where label is the slugified name.
- **Entity type subdirectories use lowercase plural model names**: `cards/`, `dashboards/`, `timelines/`, `transforms/`, `metabots/`, `documents/`, `channels/`.
- **Database/table/field paths use actual names** (not entity_ids), since these entities are identified by name.
- **FieldValues and FieldUserSettings** are stored alongside the field file with `___fieldvalues` and `___fieldusersettings` suffixes.
- **Slashes in names** are escaped as `__SLASH__` and backslashes as `__BACKSLASH__`.

## Foreign Key References

In serialized YAML, foreign keys are replaced with portable identifiers:

| Reference type | Serialized form | Example |
|---|---|---|
| Entity with entity_id (Card, Dashboard, Collection, etc.) | `entity_id` string | `collection_id: M-Q4pcV0qkiyJ0kiSWECl` |
| User | email string | `creator_id: rasta@metabase.com` |
| Database | database name | `database_id: Sample Database` |
| Table | `[db_name, schema, table_name]` | `table_id: ["Sample Database", "PUBLIC", "ORDERS"]` |
| Field | `[db_name, schema, table_name, field_name]` | `fk_target_field_id: ["Sample Database", "PUBLIC", "PRODUCTS", "ID"]` |

When `schema` is null (schemaless database), it appears as `null` in the array.

## MBQL References

Inside `dataset_query`, `definition`, and `result_metadata`, numeric IDs are also replaced with portable references:

```yaml
# source-table uses [db, schema, table] form
dataset_query:
  database: Sample Database
  query:
    source-table:
    - Sample Database
    - PUBLIC
    - ORDERS
  type: query

# field references use [db, schema, table, field] form
field_ref:
- field
- - Sample Database
  - PUBLIC
  - ORDERS
  - PRODUCT_ID
- null
```

## Template Tags (Card References in SQL)

SQL queries can reference other cards using `{{#number-name}}` syntax. In serialized form, the numeric card ID is replaced with the card's entity_id:

```yaml
dataset_query:
  database: Sample Database
  native:
    query: |-
      SELECT o.*, p.TITLE AS product_name
      FROM {{#42-orders}} AS o
      LEFT JOIN {{#99-products}} AS p ON o.PRODUCT_ID = p.ID
    template-tags:
      '#42-orders':
        card-id: RYLHsYEbrGw0JApYR9BUk    # entity_id of the referenced card
        display-name: '#42 Orders'
        id: cacf4ea0-5d41-4be0-9c8b-a6c861545ff4
        name: '#42-orders'
        type: card
      '#99-products':
        card-id: Xk7mP2qR5nWvL8dFtYh3J    # entity_id of the referenced card
        display-name: '#99 Products'
        id: 7ed5d152-1013-4632-947b-da05d51e5625
        name: '#99-products'
        type: card
  type: native
```

## Timestamps

All timestamps use ISO 8601 format with timezone: `'2024-08-28T09:46:18.671622Z'`. Always quote timestamps in YAML (they are strings).

## Settings File

`settings.yaml` at the root is a flat sorted map of setting keys to values. Unset settings have `null` values:

```yaml
aggregated-query-row-limit: null
application-font: null
enable-embedding: null
site-locale: en
site-name: My Company
```

## Generating Serialized Data

When generating YAML files from scratch:

1. **Generate unique entity_ids** for every entity using NanoID (21 chars, alphabet `A-Za-z0-9_-`).
2. **Use portable references** everywhere -- entity_ids for entity FKs, email for users, names for databases/tables/fields.
3. **Include `serdes/meta`** in every file with the correct model name and path.
4. **Create the directory structure** matching the collection hierarchy.
5. **Include `created_at`** timestamps on all entities.
6. **Set `creator_id`** to a valid email address.

For real-world examples, see:
- Test baseline: `test_resources/serialization_baseline/`
- Production instance: `src/metabase/stats-remote-sync-main/`

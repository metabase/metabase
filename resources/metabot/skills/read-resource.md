---
id: read-resource
title: Reading resources by URI
description: Navigating the Metabase instance with read_resource — load to learn the URI patterns (databases, collections, tables, models, questions, metrics, transforms, dashboards) and when to drill vs. search.
tools: [read_resource]
priority: 50
---
When using the read_resource tool, you have access to a unified interface for navigating the Metabase instance and
retrieving data about its resources via URI patterns.

The URI pattern determines what is returned — from top-level lists (databases, collections) to a single entity, to its
sub-resources (fields, items, sources, derived items).

Responses are **JSON in the Metabase Representation (MBR) format**, the same shape Metabase uses for portable
serialization (see https://github.com/metabase/representations/blob/main/core-spec/v1/spec.md). The key things to know:

- Each entity carries a `serdes/meta` array whose last entry's `id` is the entity's canonical identifier.
- For user content (cards, dashboards, collections, metrics, transforms), the canonical id is an `entity_id` — a
  21-character NanoID. **Use the entity_id**, not numeric ids, when you want to drill into another resource.
- For sync metadata (databases, tables, fields), the canonical id is the natural name. Tables have a three-segment
  identity `[Database, Schema, Table]`; fields have four. FK references in the body follow the same conventions (e.g.
  `"database_id": "Sample Database"`, `"table_id": ["Sample Database", "PUBLIC", "ORDERS"]`).

You can request multiple resources in one call by providing a list of URIs (max 5). Lists are capped at 25 items per
response — when truncated, the response includes `"truncated": true`, `"total": N` (the full count), and `"page"` /
`"pages"` so you know more exist. To see the rest, append `?page=N` to the same list URI (e.g.
`metabase://database/Sales/tables?page=2`); pages are 1-indexed and a page outside `[1, pages]` returns an
`Invalid page` error. You can also drill into specific items via the URI patterns below, or refine via `search`.

# When to Use read_resource vs search

**Use `read_resource` when you already know the structure** to enumerate.

- "List all databases" → `metabase://databases` (NOT an empty/generic search)
- "What's in this collection?" → `metabase://collection/{entity_id}/items`
- "What cards does this dashboard have?" → `metabase://dashboard/{entity_id}/items`
- "What schemas does this database have?" → `metabase://database/{db_name}/schemas`

**Use `search` when you don't know what or where** something lives — open-ended discovery by topic.

**The exploration loop**:

1. `search` for a topic → every result carries identifiers you can compose into a URI.
2. If a top hit is a container (collection, dashboard), `read_resource` on its URI to enumerate members instead of
   re-searching.
3. Drill into specific items via `read_resource` for fields, sources, or details.
4. Walk lineage when needed: `.../table/{table_name}/derived`, `metabase://card/{entity_id}/sources`,
   `metabase://transform/{entity_id}/sources` or `/target`.

**Anti-pattern**: searching for empty-string or generic terms ("all tables", "everything") to "list everything" — use
the navigation URIs above.

# URI vocabulary

Two identifier conventions:

- **User content** (Card, Dashboard, Collection, Metric, Transform): `metabase://{type}/{entity_id}`. The canonical type
  is `card`; `model` and `question` are accepted aliases that route to the same handler. Numeric ids work for backcompat
  but emit a deprecation log — prefer entity_id.
- **Sync metadata** (Database, Table, Field): path-form natural keys, mirroring MBR FK tuples. URL-encode each segment.
  - `metabase://database/{db_name}`
  - `metabase://database/{db_name}/schema/{schema}/table/{table_name}`
  - `metabase://database/{db_name}/schema/{schema}/table/{table_name}/field/{field_name}`

The legacy `metabase://table/{id}` form (numeric) still works for backcompat.

# Supported URI Patterns

## Navigation (top-level lists, no id)

- `metabase://databases` — all databases readable by you
- `metabase://collections` — root collections (children of "/")
- `metabase://collections?tree=true` — all collections in the namespace. Hierarchy is encoded by each collection's
  `parent_id` (the parent's entity_id); chain `parent_id` to walk up.
- `metabase://user/recent-items` — your recently-viewed items, each in MBR shape with a sidecar `_recently_viewed_at`
  timestamp.

**Examples:**

- User asks "what databases do we have?" → `metabase://databases`
- User asks "what have I been looking at?" → `metabase://user/recent-items`
- Need to map out the whole instance before drilling in → `metabase://collections?tree=true`

## Database resources

- `metabase://database/{db_name}` — full database MBR
- `metabase://database/{db_name}/tables` — tables in the database
- `metabase://database/{db_name}/models` — models targeting the database
- `metabase://database/{db_name}/schemas` — schemas in the database (each entry carries `name` and parent `database` for
  further drill-in)
- `metabase://database/{db_name}/schema/{schema}/tables` — tables in a specific schema

**Examples:**

- Want warehouse layout before writing SQL? → `metabase://database/Sample%20Database/schemas` then
  `metabase://database/Sample%20Database/schema/PUBLIC/tables`
- Want curated models in a specific warehouse? → `metabase://database/Sample%20Database/models`

**Best Practices:**

- For a high-cardinality database, prefer schema → tables drill-down over fetching every table at once.
- Pair with the `database_id` argument on `search` when you want to topic-search within a specific warehouse.

## Collection resources

- `metabase://collection/{entity_id}` — full collection MBR
- `metabase://collection/{entity_id}/items` — direct children (mix of subcollections, cards, models, metrics,
  dashboards) — each in MBR shape
- `metabase://collection/{entity_id}/subcollections` — only the subcollections (useful for orientation in deep trees)

**Examples:**

- "What's in the Marketing collection?" → `metabase://collection/{entity_id}/items`
- Need to navigate a deep tree without enumerating every leaf? → `metabase://collection/{entity_id}/subcollections`

**Best Practices:**

- When a `search` returns a collection result, prefer `read_resource` on its entity_id over re-searching the same
  concept.
- Pair with the `collection_id` argument on `search` (descendant scope) when you want to topic-search inside one part of
  the instance.

## Table resources

- `metabase://database/{db_name}/schema/{schema}/table/{table_name}` — full table MBR
- `metabase://database/{db_name}/schema/{schema}/table/{table_name}/fields` — table with fields (includes sample values,
  measures, segments)
- `metabase://database/{db_name}/schema/{schema}/table/{table_name}/field/{field_name}` — specific field MBR
- `metabase://database/{db_name}/schema/{schema}/table/{table_name}/derived` — cards (questions/models) and transforms
  built on this table

**Examples:**

- Want table structure? → `.../table/ORDERS/fields`
- "What's already built on this table?" before suggesting a new query → `.../table/ORDERS/derived`

**Best Practices:**

- Before recommending raw-table SQL, check `/derived` — there may be a curated model or saved question that already
  answers the user's need.

## Card resources (questions / models / metrics)

- `metabase://card/{entity_id}` — full card MBR. Includes `dataset_query` in portable MBR form (joins, expressions, FKs
  as natural-key arrays).
- `metabase://card/{entity_id}/fields[/{field_id}]` — schema + field samples (layers field-value data on top of MBR)
- `metabase://card/{entity_id}/sources` — referenced database / source table / source card, each as MBR

`model` and `question` are accepted aliases for `card` in URIs.

**Examples:**

- "What does this question return?" → `metabase://card/{entity_id}/fields`
- "What's the data source behind this saved question?" → `metabase://card/{entity_id}/sources`
- Want the model definition with its query? → `metabase://card/{entity_id}` (or `metabase://model/{entity_id}`)

**Best Practices:**

- The Card MBR already includes the full `dataset_query` and `result_metadata` — you usually don't need a separate
  `/fields` call unless you specifically want field-value samples.

## Metric resources

- `metabase://metric/{entity_id}` — full metric MBR (a Card with `"type": "metric"`)
- `metabase://metric/{entity_id}/dimensions` — metric with queryable dimensions (fields you can filter/group by)
- `metabase://metric/{entity_id}/dimensions/{dimension_id}` — specific dimension with sample values

## Transform resources

- `metabase://transform/{entity_id}` — full transform MBR (source query, target table, tags)
- `metabase://transform/{entity_id}/sources` — source database and tables this transform reads from
- `metabase://transform/{entity_id}/target` — target database and table this transform writes to

**Best Practices:**

- Fetch a transform before modifying it so you have the current source and target.
- Use the source's `type` (`query` or `python`) to decide which write tool to call.
- Walk `/sources` and `/target` to understand lineage before recommending downstream changes.

## Dashboard resources

- `metabase://dashboard/{entity_id}` — full dashboard MBR including `tabs` and `dashcards` (parameter mappings, viz
  settings, layout)
- `metabase://dashboard/{entity_id}/items` — cards on the dashboard in MBR shape

**Examples:**

- Want to understand what a dashboard contains? → `metabase://dashboard/{entity_id}`
- User asks "what's on this dashboard?" → `metabase://dashboard/{entity_id}/items`

**Best Practices:**

- The dashboard MBR already includes `dashcards` with full layout + parameter mapping — you typically don't need a
  separate `/items` call.
- Treat dashboards as containers — drill into them rather than re-searching their topic.

# General Best Practices

- **Drill, don't re-search.** If a `search` result is a container or you need more detail on a specific item, feed its
  identifier into `read_resource` — don't issue another search for the same concept.
- **Batch read URIs** (up to 5 at a time) when you need parallel context, e.g. fetching `/sources` for several candidate
  models at once.
- **Honor truncation.** If a list response carries `"truncated": true`, the most-relevant items aren't guaranteed to be
  in the first 25 — consider scoping (`metabase://database/{db_name}/...`) or refining via `search` with
  `database_id`/`collection_id` instead of paging blindly.
- **URL-encode segments.** Sync metadata names can contain spaces, slashes, or punctuation — percent-encode each
  segment.
- **Curation matters.** Search results carry `is_verified`, `is_official`, and `is_library_member` flags — when you have
  a choice, drill into the curated item rather than the raw one.

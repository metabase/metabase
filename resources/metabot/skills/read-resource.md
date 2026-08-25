---
id: read-resource
title: Reading resources by URI
description: Navigating the Metabase instance with read_resource — load to learn the URI patterns (databases, collections, tables, models, questions, metrics, transforms, dashboards) and when to drill vs. search.
tools: [read_resource]
priority: 50
---
When using the read_resource tool, you have access to a unified interface for navigating the Metabase instance and retrieving data about its resources via URI patterns.

The URI pattern determines what is returned — from top-level lists (databases, collections) to a single entity, to its sub-resources (fields, items, sources, derived items).

You can request multiple resources in one call by providing a list of URIs (max 5). Lists are paginated at 25 items per page. Every `<list>` carries `total`, `page`, `pages`, `showing`, and `truncated` — `truncated` is always present, reading `"false"` when you have the whole list and `"true"` when more pages remain, in which case a `<truncation-note>` names the next page. From there you can fetch the next page by appending `?page=N` to the same URI (e.g. `metabase://database/1/tables?page=2`), drill into a specific item via its URI (each list item carries a `uri="..."` attribute), or refine via `search`.

# When to Use read_resource vs search

**Use `read_resource` when you already know the structure** to enumerate.
- "List all databases" → `metabase://databases` (NOT an empty/generic search)
- "What's in this collection?" → `metabase://collection/{id}/items`
- "What cards does this dashboard have?" → `metabase://dashboard/{id}/items`
- "What schemas does this database have?" → `metabase://database/{id}/schemas`

**Use `search` when you don't know what or where** something lives — open-ended discovery by topic.

**The exploration loop**:
1. `search` for a topic → every result carries a `uri` attribute.
2. If a top hit is a container — its element name is `<collection>` or `<dashboard>` — `read_resource` on its URI to enumerate members instead of re-searching.
3. Drill into specific items via `read_resource` for fields, sources, or details.
4. Walk lineage when needed: `metabase://table/{id}/derived`, `metabase://model/{id}/sources`, `metabase://transform/{id}/sources` or `/target`.

**Anti-pattern**: searching for empty-string or generic terms ("all tables", "everything") to "list everything" — use the navigation URIs above.

# Supported URI Patterns

## Navigation (top-level lists, no id)

- `metabase://databases` — all databases readable by you
- `metabase://collections` — root collections (children of "/")
- `metabase://collections?tree=true` — flat list of all collections; use `:location` (e.g. `/12/34/`) and `:path` to understand hierarchy
- `metabase://user/recent-items` — your recently-viewed items

**Examples:**
- User asks "what databases do we have?" → `metabase://databases`
- User asks "what have I been looking at?" → `metabase://user/recent-items`
- Need to map out the whole instance before drilling in → `metabase://collections?tree=true`

## Database resources

- `metabase://database/{id}` — basic database info
- `metabase://database/{id}/tables` — tables in the database
- `metabase://database/{id}/models` — models targeting the database
- `metabase://database/{id}/schemas` — schemas in the database (each one carries a URI you can drill into)
- `metabase://database/{id}/schemas/{schemaName}/tables` — tables in a specific schema

**Examples:**
- Want to see warehouse layout before writing SQL? → `metabase://database/1/schemas` then `metabase://database/1/schemas/PUBLIC/tables`
- Want curated models in a specific warehouse? → `metabase://database/1/models`

**Best Practices:**
- For a high-cardinality database, prefer schema → tables drill-down over fetching every table at once.
- In the SQL editor, `search` already scopes to the current database via its own `database_id` argument — no need to filter further. Elsewhere, `search` has no per-database filter; narrow with `entity_types` and topic terms instead.

## Collection resources

- `metabase://collection/{id}` — basic collection info
- `metabase://collection/{id}/items` — direct children (mix of subcollections, cards, models, metrics, dashboards, documents)
- `metabase://collection/{id}/subcollections` — only the subcollections (useful for orientation in deep trees)

**Examples:**
- "What's in the Marketing collection?" → `metabase://collection/{id}/items`
- Need to navigate a deep tree without enumerating every leaf? → `metabase://collection/{id}/subcollections`

**Best Practices:**
- When a `search` returns a `<collection>` result, prefer `read_resource` on its URI over re-searching the same concept.

## Table resources

- `metabase://table/{id}` — basic table info
- `metabase://table/{id}/fields` — table with fields
- `metabase://table/{id}/fields/{field_id}` — specific field with sample values and stats
- `metabase://table/{id}/derived` — cards (questions/models) and transforms built on this table

**Examples:**
- Want table structure (fields without value information)? → `metabase://table/123/fields`
- Want detailed field information (sample values for format patterns)? → `metabase://table/123/fields/1`
- "What's already built on this table?" before suggesting a new query → `metabase://table/123/derived`

**Best Practices:**
- Before recommending raw-table SQL, check `/derived` — there may be a curated model or saved question that already answers the user's need.

## Model resources

- `metabase://model/{id}` — basic model info
- `metabase://model/{id}/fields` — model with fields
- `metabase://model/{id}/fields/{field_id}` — detailed field info with sample values
- `metabase://model/{id}/sources` — tables/cards this model is derived from (FK-resolved: database, source table, and source card if any)

**Examples:**
- Want model structure? → `metabase://model/456/fields`
- Want sample values for format patterns? → `metabase://model/456/fields/1`
- Need to understand a model's lineage before editing or chaining off it? → `metabase://model/456/sources`

## Question resources

- `metabase://question/{id}` — basic question info
- `metabase://question/{id}/fields` — question with fields
- `metabase://question/{id}/fields/{field_id}` — detailed field info with sample values
- `metabase://question/{id}/sources` — tables/cards this question references (FK-resolved)

**Examples:**
- "What does this question return?" → `metabase://question/456/fields`
- "What's the data source behind this saved question?" → `metabase://question/456/sources`

## Metric resources

- `metabase://metric/{id}` — basic metric info
- `metabase://metric/{id}/dimensions` — metric with queryable dimensions (fields you can filter/group by)
- `metabase://metric/{id}/dimensions/{dimension_id}` — specific dimension with sample values

**Examples:**
- Want metric dimensions? → `metabase://metric/789/dimensions`
- Want sample values for a dimension? → `metabase://metric/789/dimensions/1`

## Transform resources

- `metabase://transform/{id}` — transform details and configuration
- `metabase://transform/{id}/sources` — source database and tables this transform reads from
- `metabase://transform/{id}/target` — target database and table this transform writes to

**Examples:**
- Want to inspect a transform's SQL or Python source before editing it? → `metabase://transform/42`
- "What does this transform read?" → `metabase://transform/42/sources`
- "Where does this transform write?" → `metabase://transform/42/target`

**Best Practices:**
- Fetch a transform's details before modifying it so you have the current source query and target configuration.
- Use the returned source type (`query` or `python`) to understand how the transform is implemented before recommending changes to it.
- Walk `/sources` and `/target` to understand lineage before recommending downstream changes.

## Dashboard resources

- `metabase://dashboard/{id}` — dashboard details
- `metabase://dashboard/{id}/items` — everything on the dashboard in layout order: question cards (each rendered as a `metabase://question/{id}` URI you can drill into) plus headings, text cards, and action buttons

**Examples:**
- Want to understand what a dashboard contains before recommending it? → `metabase://dashboard/158`
- User asks "what's on this dashboard?" → `metabase://dashboard/158/items`

**Best Practices:**
- Treat dashboards as containers — when search returns a `<dashboard>` hit, use `/items` to list its cards instead of re-searching for the same concept.
- Every dashcard entry carries a `dashcard_id`. Headings and text cards show as `virtual_heading`/`virtual_text` with their text as the description; action buttons show as `action` (with a `uri` to their backing model when readable). On multi-tab dashboards the list opens with a `<tabs>` block naming every tab — empty ones included — and dashcard entries carry their tab's `tab_id`, grouped in tab order.
- Fetch dashboard details to confirm it contains the information the user is looking for before recommending it.
- Prefer verified dashboards when they match the user's request.

# General Best Practices

- **Drill, don't re-search.** If a `search` result is a container or you need more detail on a specific item, feed its `uri` back into `read_resource` — don't issue another search for the same concept.
- **Batch read URIs** (up to 5 at a time) when you need parallel context, e.g. fetching `/sources` for several candidate models at once.
- **Honor truncation.** If a list response carries `truncated="true"`, the most-relevant items are not guaranteed to be in the first 25. You have two ways forward: page through the remainder by appending `?page=N` to the same URI (the `pages` attribute tells you how many there are), or narrow the request — scope it (`metabase://database/{id}/...`) or refine your `search` query (narrower `entity_types` or topic terms). Narrow when you are hunting for one specific item; page when you genuinely need the whole list.
- **Curation matters.** Search results carry `is_verified`, `is_official`, and `is_curated` flags (plus `data_authority` where configured) — when you have a choice, drill into the curated item rather than the raw one.

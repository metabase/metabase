---
id: read-resource
title: Reading resources by URI
description: Navigating the Metabase instance with read_resource — load to learn the URI patterns (databases, collections, tables, models, questions, metrics, transforms, dashboards) and when to drill vs. search.
tools: [read_resource]
priority: 50
---
When using the read_resource tool, you have access to a unified interface for navigating the Metabase instance and retrieving data about its resources via URI patterns.

The URI pattern determines what is returned — from top-level lists (databases, collections) to a single entity, to its sub-resources (fields, items, sources, derived items).

You can request multiple resources in one call by providing a list of URIs (max 5). Lists are paginated at 25 items per page. Every `<list>` carries `total`, `page`, `pages`, `showing`, and `truncated` — `truncated` is always present, reading `"true"` when pages remain after this one and `"false"` when this is the last page (which only means the whole list if you've also fetched every earlier page — on page 3 of 3, `"false"` still means you've only seen a third of the list). When more pages remain, a `<truncation-note>` names the next page and gives you the exact URI to fetch it — copy that URI as-is; don't build your own `page=N` query param (a second `?` on a URI that already has one silently breaks the query instead of erroring). Drill into a specific item via its URI (list items carry a `uri="..."` attribute — the exception is a dashboard's virtual items, `virtual_heading`/`virtual_text` and the like, which are not addressable resources and carry a `dashcard_id` instead), or refine via `search`.

# When to Use read_resource vs search

**Use `read_resource` when you already know the structure** to enumerate.
- "List all databases" → `metabase://databases` (NOT an empty/generic search)
- "What's in this collection?" → `metabase://collection/{id}/items`
- "What cards does this dashboard have?" → `metabase://dashboard/{id}/items`
- "What schemas does this database have?" → `metabase://database/{id}/schemas`

**Use `search` when you don't know what or where** something lives — open-ended discovery by topic.

> **If you have no `search` tool**, substitute whichever discovery tool you do have (e.g. `retrieve_library_entities`) everywhere this skill says `search` — the loop is the same, only the entry point differs. Its results carry the same URIs, so everything below about drilling in with `read_resource` still applies.

**The exploration loop**:
1. `search` for a topic → every result carries a `uri` attribute.
2. If a top hit is a container — its element name is `<dashboard>` or `<document>` — `read_resource` on its URI to enumerate members instead of re-searching. (`search` never returns collections; reach those by navigating, e.g. `metabase://collection/{id}/items`.)
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
- Collections are never `search` results — the only way to reach one is by navigating (`metabase://collections`, `metabase://collections?tree=true`, or a parent's `/subcollections`). To see what a collection holds, `read_resource` its `/items` rather than searching for the collection's name.

## Table resources

- `metabase://table/{id}` — basic table info
- `metabase://table/{id}/fields` — table with fields
- `metabase://table/{id}/fields/{field_id}` — specific field with sample values and stats
- `metabase://table/{id}/derived` — cards (questions/models) built on this table, plus the transforms that declare it as a source. Only `python` transforms declare their source tables, so a SQL/`query` transform reading this table will **not** appear here.

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

- `metabase://transform/{id}` — transform details and configuration, including the source query for a `query` transform. Python transforms report `type="python"` but their script body is **not** included.
- `metabase://transform/{id}/sources` — the source database, plus source tables for `python` transforms only (see below)
- `metabase://transform/{id}/target` — target database and table this transform writes to

**Examples:**
- Want to inspect a `query` transform's SQL/MBQL before editing it? → `metabase://transform/42`
- "What does this transform read?" → `metabase://transform/42/sources`
- "Where does this transform write?" → `metabase://transform/42/target`

**Best Practices:**
- Fetch a transform's details before modifying it so you have the current target configuration and — for `query` transforms — the current source query.
- Check the returned source type (`query` or `python`) first: it decides both how the transform is implemented and how much lineage you can see.
- **Lineage is asymmetric between the two source types.** A `python` transform declares its inputs explicitly, so `/sources` lists its source tables and those tables' `/derived` lists it back. A `query` transform's inputs live inside its query, which is not walked — so `/sources` returns only its database with no tables, and it never shows up under any table's `/derived`, even when its SQL plainly reads that table.
- Because of that asymmetry, a table's `/derived` is not proof that nothing reads it. When it matters whether a `query` transform touches a table, fetch the candidate transforms' details and read their source queries rather than trusting `/derived` to be complete.
- Walk `/sources` and `/target` to understand lineage before recommending downstream changes, keeping the gap above in mind.

## Dashboard resources

- `metabase://dashboard/{id}` — dashboard details
- `metabase://dashboard/{id}/items` — everything on the dashboard in layout order: card-backed dashcards (each with a URI you can drill into, matching the backing card's own type — `metabase://question/{id}`, `metabase://model/{id}`, or `metabase://metric/{id}`) plus headings, text cards, and action buttons

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
- **Honor truncation.** If a list response carries `truncated="true"`, the most-relevant items are not guaranteed to be in the first 25. You have two ways forward: page through the remainder by fetching the URI given in the `<truncation-note>` (the `pages` attribute tells you how many there are), or narrow the request — scope it (`metabase://database/{id}/...`) or refine your `search` query (narrower `entity_types` or topic terms). Narrow when you are hunting for one specific item; page when you genuinely need the whole list, and remember `truncated="false"` on a later page doesn't mean you've seen the earlier ones too.
- **Curation matters.** Search results carry `is_verified`, `is_official`, and `is_curated` flags (plus `data_authority` where configured) — when you have a choice, drill into the curated item rather than the raw one.

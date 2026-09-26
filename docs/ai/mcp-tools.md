---
title: MCP server tools
summary: The tools Metabase's MCP server exposes to AI clients, the permission each one needs, and the arguments each one takes.
---

# MCP server tools

_This documentation was generated from source by running:_

```
clojure -M:ee:doc mcp-tools-documentation
```

These are the tools an AI client can call once you've [connected it to your Metabase's MCP server](./mcp.md). Every tool runs as you, scoped to your permissions, so a tool can never reach data you couldn't see in Metabase yourself.

Some clients (like Claude Desktop) ask you to approve or block each tool the first time it's used.

The argument notes here are exactly what your agent sees (which is why they sound robotic). Several tools take or return a `query_handle`. A handle stands for a query that already ran (or was validated), so your agent can visualize or save exactly that query without sending it again. By default, handles expire after 24 hours.

Your agent will use `execute_query` for anything Metabase's query language can express (counts, sums, grouping, filtering, joins) and `execute_sql` for the rest (window functions, CTEs, engine-specific functions), or when you ask for SQL outright.

## Alert write

- Tool name: `alert_write`
- Permission scope: `agent:delivery:write` — Set up scheduled delivery of your data to email addresses and Slack channels it chooses
- Creates or changes content.

Arguments:

| Argument        | Type              | Description                                                                                                                                                                                                                                       |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`        | boolean           | false pauses the alert, true resumes it (resuming needs the agent:query:run scope). Defaults to true on create. Alerts have no archived state and cannot be deleted here.                                                                         |
| `card_id`       | integer or string | Numeric id of the saved question the alert runs. Fixed at creation. 21-character entity_id of the saved question the alert runs. Fixed at creation.                                                                                               |
| `channel`       | string            | One of: `email`, `slack`. Where to deliver: "email" (default) with `recipients`, or "slack" with `slack_channel`. Passing any of channel, slack_channel, or recipients on update replaces the alert's delivery; omit all three to leave it alone. |
| `condition`     | object            | When the alert sends. Defaults to sending whenever the question returns rows; the goal conditions need a goal line on the question's chart.                                                                                                       |
| `id`            | integer or string | Numeric id of the alert to update. The numeric id as a string, for clients that send every id as a string. Alerts have no entity_id.                                                                                                              |
| `method`        | string            | One of: `create`, `update`. "create" makes a new alert (requires `card_id` and `schedule`); "update" edits the one named by `id`, changing only the fields you pass.                                                                              |
| `recipients`    | array             | Who gets the email: numeric user ids, or email addresses. Defaults to you. On update this replaces the current list. Not used for channel "slack". Numeric id of a Metabase user. An email address.                                               |
| `schedule`      | object            | When the question runs, in the instance's report time zone. Required on create; never a cron string.                                                                                                                                              |
| `slack_channel` | string            | Slack channel name to post to, e.g. "#data-team". Required for channel "slack".                                                                                                                                                                   |

## Bookmark content

- Tool name: `bookmark_content`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Creates or changes content.
- Running it again with the same arguments has the same effect as running it once.

Arguments:

| Argument     | Type              | Description                                                                                                                              |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `bookmarked` | boolean           | true bookmarks the item, false removes the bookmark.                                                                                     |
| `id`         | integer or string | Numeric id. A 21-character entity_id.                                                                                                    |
| `type`       | string            | One of: `collection`, `dashboard`, `document`, `metric`, `model`, `question`. The content type, as returned by search/browse_collection. |

## Browse collection

- Tool name: `browse_collection`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument          | Type              | Description                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created_by`      | string            | One of: `me`. items mode: me restricts results to items the current user created (questions, models, metrics, dashboards, documents — other types return nothing under this filter). Composes with type.                                                                                                                                                                                  |
| `depth`           | integer           | Range: 1 to 10. tree mode: subcollection levels to expand (default 2, max 10). Deeper or trimmed nodes carry a truncation marker naming the re-rooting call.                                                                                                                                                                                                                              |
| `fields`          | array of string   | items mode: dot-paths picked from the detailed row shape, item-relative (e.g. "last-edit-info.email"). Mutually exclusive with response_format.                                                                                                                                                                                                                                           |
| `id`              | integer or string | Numeric collection id. A 21-character entity_id, "root" (the per-namespace root), or "trash" (items mode only — archived content, making restore discoverable).                                                                                                                                                                                                                           |
| `limit`           | integer           | Range: 1 to 500. items mode: maximum rows to return (default 50, max 500).                                                                                                                                                                                                                                                                                                                |
| `mode`            | string            | One of: `items`, `tree`. items (default): one collection's contents — paged, mixed types, filterable and sortable. tree: the nested subcollection structure only (no items, no pagination), for getting oriented across the hierarchy.                                                                                                                                                    |
| `namespace`       | string            | One of: `content`, `snippets`, `transforms`, `analytics`. Which collection partition to browse; only meaningful with id: "root" (a real collection id already carries its namespace). content (default) holds questions/dashboards/etc.; snippets holds snippet folders and snippets; transforms holds transform folders and transforms; analytics is the read-only usage-analytics tree. |
| `offset`          | integer           | items mode: rows to skip, for paging.                                                                                                                                                                                                                                                                                                                                                     |
| `pinned_state`    | string            | One of: `all`, `is_pinned`, `is_not_pinned`. items mode: all (default) interleaves pinned and unpinned rows. Pinned-first as in the product is two calls — is_pinned, then is_not_pinned — each paging independently.                                                                                                                                                                     |
| `response_format` | string            | One of: `concise`, `detailed`. items mode: concise (default) returns {id, name, model, description, collection_position} rows; detailed adds entity_id, collection_id, archived, location, and last-edit info.                                                                                                                                                                            |
| `sort_column`     | string            | One of: `name`, `last_edited_at`, `model`. items mode: sort key (default name).                                                                                                                                                                                                                                                                                                           |
| `sort_direction`  | string            | One of: `asc`, `desc`. items mode: sort direction (default asc).                                                                                                                                                                                                                                                                                                                          |
| `type`            | array of string   | One of: `question`, `model`, `metric`, `dashboard`, `collection`, `document`. items mode, content namespace only: return only these item types.                                                                                                                                                                                                                                           |

## Browse data

- Tool name: `browse_data`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument          | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`          | string           | One of: `list_databases`, `list_schemas`, `list_tables`, `list_models`, `get_fields`. What to browse. list_databases → list_schemas → list_tables → get_fields walks the hierarchy; list_models lists the models built on a database.                                                                                                                                                                                                                                                                                      |
| `database_id`     | integer          | Numeric database id (databases have no entity_id). Required for list_schemas, list_tables, and list_models. Ignored by get_fields.                                                                                                                                                                                                                                                                                                                                                                                         |
| `fields`          | array of string  | Dot-paths picked from the detailed row shape, item-relative (e.g. "fields.name"). Mutually exclusive with response_format. Not supported for list_schemas.                                                                                                                                                                                                                                                                                                                                                                 |
| `include_hidden`  | boolean          | Include hidden schemas/tables (list_schemas, list_tables) or hidden fields (get_fields). Sensitive fields are always excluded. Default false.                                                                                                                                                                                                                                                                                                                                                                              |
| `limit`           | integer          | Range: 1 to 500. list_* actions: maximum rows to return (default 50, max 500).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `offset`          | integer          | list_* actions: rows to skip, for paging. For get_fields it pages the fields of a single oversized table, as directed by the continuation message.                                                                                                                                                                                                                                                                                                                                                                         |
| `response_format` | string           | One of: `concise`, `detailed`. concise (default) returns the essential columns; detailed adds the full projection (for get_fields: effective_type, coercion_strategy, database_type, fingerprint, has_field_values, and inline values for list-type fields). Values and fingerprints are permission-dependent, and absent rather than empty when withheld: values need permission to query the table, not just to read its metadata, and fingerprints are withheld entirely when your row access to the table is narrowed. |
| `schema`          | string           | list_tables only: the schema to list. Omit (or pass "") for databases without schemas.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `search`          | string           | list_tables only: case-insensitive substring filter on table name or display name, applied before paging.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `table_ids`       | array of integer | get_fields only: numeric table ids (tables have no entity_id), at most 20 per call.                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Collection write

- Tool name: `collection_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Can overwrite or delete existing data or content.

Arguments:

| Argument          | Type              | Description                                                                                                                                                                                                                                                                       |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`        | boolean           | Update only: true moves the collection and its contents to the trash, false restores them. Archiving is the only removal path — there is no hard delete. Omit to leave the collection's trashed state alone.                                                                      |
| `authority_level` | string            | One of: `official`. Marks the collection Official. Requires an admin on an instance with the Official Collections feature. To make a collection unofficial again, name it in `clear` — `clear: ["authority_level"]`.                                                              |
| `clear`           | array of string   | One of: `description`, `authority_level`. Update only: property names to unset (description, authority_level). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary.                         |
| `description`     | string            | Optional human-readable description. To remove one, name it in `clear` — `clear: ["description"]`.                                                                                                                                                                                |
| `id`              | integer or string | Numeric id of the collection to update. 21-character entity_id of the collection to update.                                                                                                                                                                                       |
| `method`          | string            | One of: `create`, `update`. "create" makes a new collection (requires `name`); "update" edits the one named by `id`.                                                                                                                                                              |
| `name`            | string            | Required on create; editable on update: display name of the collection.                                                                                                                                                                                                           |
| `namespace`       | string            | One of: `snippets`, `transforms`. Create only: puts the collection in a separate hierarchy instead of the normal one. "snippets" holds SQL snippet folders; "transforms" holds transform folders, the ones transform_write's `collection_id` names. Omit for a normal collection. |
| `parent_id`       | integer or string | The collection to nest under (create) or move into (update). Numeric id, 21-character entity_id, or "root" for the top level. Omitted on create means your personal collection. You need write access to the parent.                                                              |

## Dashboard write

- Tool name: `dashboard_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Can overwrite or delete existing data or content.

Arguments:

| Argument              | Type              | Description                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`            | boolean           | Update only: true moves it to the trash, false restores it. Archiving is the only removal path — there is no hard delete.                                                                                                                                                                 |
| `auto_apply_filters`  | boolean           | When false, filter changes wait for the viewer to press Apply. Default true.                                                                                                                                                                                                              |
| `cache_ttl`           | integer           | Cache lifetime for this dashboard's results, in hours.                                                                                                                                                                                                                                    |
| `clear`               | array of string   | One of: `description`, `collection_position`, `cache_ttl`. Update only: property names to unset (description, collection_position, cache_ttl). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary. |
| `collection_id`       | integer or string | Numeric id of the collection to put it in. Omit on create for your personal collection. Collection entity_id, or "root" for the top-level collection.                                                                                                                                     |
| `collection_position` | integer           | Pin position within the collection; omit to leave it unpinned.                                                                                                                                                                                                                            |
| `description`         | string            | One or two sentences on what the dashboard answers.                                                                                                                                                                                                                                       |
| `id`                  | integer or string | Numeric id of the dashboard to update. 21-character entity_id of the dashboard to update.                                                                                                                                                                                                 |
| `method`              | string            | One of: `create`, `update`. "create" makes a new dashboard (requires `name`); "update" edits the one named by `id`.                                                                                                                                                                       |
| `name`                | string            | Dashboard title.                                                                                                                                                                                                                                                                          |
| `ops`                 | array of object   | Editor operations, applied in order. One atomic save on update; on create the dashboard row is written before the ops are applied.                                                                                                                                                        |
| `validate_only`       | boolean           | Dry run: returns the layout the ops would produce, writing nothing.                                                                                                                                                                                                                       |
| `width`               | string            | One of: `fixed`, `full`. "fixed" (default) centers the grid; "full" stretches it to the browser width.                                                                                                                                                                                    |

## Document write

- Tool name: `document_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Creates or changes content.

Arguments:

| Argument              | Type              | Description                                                                                                                                                                                                                                                                                                      |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`            | boolean           | Update only: true moves it to the trash, false restores it.                                                                                                                                                                                                                                                      |
| `clear`               | array of string   | One of: `collection_position`. Update only: property names to unset (collection_position). A null cannot say this — strict clients fill every unset property with null, so nulls are stripped at the boundary.                                                                                                   |
| `collection_id`       | integer or string | Numeric id of the collection to put it in. Omit on create for your personal collection. Collection entity_id, or "root" for the top-level collection.                                                                                                                                                            |
| `collection_position` | integer           | Pin position within the collection; omit to leave it unpinned.                                                                                                                                                                                                                                                   |
| `content_markdown`    | string            | The full body in Metabase-flavored Markdown: CommonMark plus card embeds, entity links, and ::: layout containers (learn("documents")). Required on create. On update it is a deliberate full-body rewrite that orphans every comment thread anchored to the body; pass `edits` to change text in place instead. |
| `edits`               | array of object   | Update only: surgical text edits, each {old_str, new_str, replace_all?}, applied in order against the current server-side Markdown. Exactly one of `edits` or `content_markdown`. An empty list changes only name, collection_id, collection_position, or archived without touching the body.                    |
| `id`                  | integer or string | Numeric id of the document to update. 21-character entity_id of the document to update.                                                                                                                                                                                                                          |
| `method`              | string            | One of: `create`, `update`. "create" makes a new document (requires `name` and `content_markdown`); "update" edits the one named by `id`.                                                                                                                                                                        |
| `name`                | string            | Document title. Required on create; on update, renames it.                                                                                                                                                                                                                                                       |

## Duplicate content

- Tool name: `duplicate_content`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Creates or changes content.

Arguments:

| Argument        | Type              | Description                                                                                                                                               |
| --------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collection_id` | integer or string | Collection to copy into. Omit to copy into your personal collection; pass "root" for the root collection. A 21-character collection entity_id, or "root". |
| `id`            | integer or string | Numeric id of the item to copy. A 21-character entity_id of the item to copy.                                                                             |
| `is_deep_copy`  | boolean           | Dashboards only: also copy the dashboard's questions into the destination collection, instead of pointing the copy at the originals.                      |
| `new_name`      | string            | Name for the copy. Defaults to "Copy of <source name>".                                                                                                   |
| `type`          | string            | One of: `question`, `dashboard`, `document`. The kind of content to copy. Card flavors other than question (model, metric) aren't supported yet.          |

## Execute query

- Tool name: `execute_query`
- Permission scope: `agent:query:run` — Run queries against your connected databases and see the results
- Read-only.

Arguments:

| Argument        | Type    | Description                                                                                                                                                                               |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor`        | string  | The next_cursor from a previous truncated response — fetches the next page. Exactly one of query \| query_handle \| cursor, but row_limit may accompany it and sets this page's size.     |
| `prompt`        | string  | The user's original request, stored with the minted query_handle and carried along its cursor pages.                                                                                      |
| `query`         | object  | A fresh structured query (shape and examples in the tool description): numeric table/field ids from browse_data, never base64, never SQL. Exactly one of query \| query_handle \| cursor. |
| `query_handle`  | string  | A query_handle from a previous call — re-validates and re-runs the exact stored query. Exactly one of query \| query_handle \| cursor.                                                    |
| `row_limit`     | integer | Range: 1 to 2000. Maximum rows to return in this call (default 100, max 2000) — the page size, not a bound on the result; the bound is limit: N in the query's stage.                     |
| `validate_only` | boolean | true validates against schema + database metadata and mints a query_handle without executing (default false).                                                                             |

## Execute SQL

- Tool name: `execute_sql`
- Permission scope: `agent:sql:run` — Write and run its own raw SQL on your connected databases
- Can overwrite or delete existing data or content.

Arguments:

| Argument              | Type    | Description                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database_id`         | integer | Numeric id of the database to run the SQL against. Requires native-query permission on it.                                                                                                                                                                                                                                                      |
| `prompt`              | string  | The user's original request, stored with the minted query_handle and carried along its cursor pages.                                                                                                                                                                                                                                            |
| `row_limit`           | integer | Range: 1 to 2000. Maximum rows to return in this call (default 100, max 2000).                                                                                                                                                                                                                                                                  |
| `sql`                 | string  | The raw SQL text, run verbatim against the database. Put caller-supplied values behind {% raw %}{{tag}}{% endraw %} placeholders bound via template_tag_values — never splice them into this string.                                                                                                                                            |
| `template_tag_values` | object  | Values for the {% raw %}{{tag}}{% endraw %} placeholders in sql, keyed by tag name. Each value binds as a driver-level prepared-statement parameter (injection-safe): strings bind as text, numbers as numbers. Snippet ({% raw %}{{snippet: …}}{% endraw %}) and card-reference ({% raw %}{{#123}}{% endraw %}) tags cannot be populated here. |
| `validate_only`       | boolean | true mints a query_handle without executing — template tags and permissions are checked, the SQL text itself is not (default false).                                                                                                                                                                                                            |

## Get content

- Tool name: `get_content`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument          | Type            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include`         | array of string | One of: `definition`, `fields`, `visualization_settings`, `parameters`, `layout`, `dimensions`, `comments`. Extra sections, each applied to every item whose type supports it and ignored for the rest — so a mixed-type batch can ask for several at once: definition (query-bearing types, returned as the stored query — numeric ids, the shape execute_query and question_write accept back verbatim), fields (question/model column metadata), visualization_settings (question/model stored chart settings, the shape question_write takes back; {} when nothing is stored), parameters (dashboard's full parameter array), layout (dashboard grid + tabs, document block outline), dimensions (metric/measure), comments (document comment threads, each anchored into the returned content_markdown by {start, end, text} character offsets — the exact slice of the block the thread is attached to; comments attach to whole blocks, a block nested inside a list/blockquote anchors to the span of the nearest enclosing block that has one, and an empty block gives start == end; threads whose block no longer exists come back under orphaned_comments so they can be re-anchored by editing the right block, and if the document read fell back to flattened text no thread carries an anchor). A section no item in the batch supports is an error. |
| `items`           | array of object | The content to fetch — up to 10 items, mixed types allowed (e.g. a dashboard and its questions in one call).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `response_format` | string          | One of: `concise`, `detailed`. concise (default) returns each type's essential shape; detailed adds entity_id, creator, timestamps, and other secondary columns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Get parameter values

- Tool name: `get_parameter_values`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument       | Type              | Description                                                                                                                                                                                                                    |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `constraints`  | object            | Chain filtering: the current selections of the dashboard's OTHER filters, keyed by their parameter ids, narrowing this filter to the values still valid alongside them. Dashboards only.                                       |
| `id`           | integer or string | Numeric id. A 21-character entity_id.                                                                                                                                                                                          |
| `limit`        | integer           | Range: 1 to 1000. Maximum values to return in this call (default 100, max 1000).                                                                                                                                               |
| `offset`       | integer           | Index of the first value to return (default 0) — continue a truncated response. Each page refetches from the source, which returns at most 1000 values, so narrow with `query` rather than paging to reach anything past that. |
| `parameter_id` | string            | The parameter's id, as returned by get_content under `parameters` — not its name or slug.                                                                                                                                      |
| `query`        | string            | Return only values matching this search string. Use it to narrow a large value list.                                                                                                                                           |
| `target`       | string            | One of: `dashboard`, `question`. Whether id names a dashboard or a card. "question" covers any card — question, model, or metric.                                                                                              |

## Glossary

- Tool name: `glossary`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument | Type    | Description                                                                                                           |
| -------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `limit`  | integer | Range: 1 to 500. Maximum entries to return (default 50, max 500). Ignored with "term", which is a lookup, not a page. |
| `offset` | integer | Number of entries to skip, for paging (default 0). Ignored with "term".                                               |
| `term`   | string  | The term to define, matched case-insensitively. Omit to list terms with their definitions.                            |

## Learn

- Tool name: `learn`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument    | Type   | Description                                                                |
| ----------- | ------ | -------------------------------------------------------------------------- |
| `reference` | string | A reference file of `topic`, by the name the skill (or the catalog) lists. |
| `topic`     | string | A topic from the catalog. Omit to list all topics.                         |

## Measure write

- Tool name: `measure_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Can overwrite or delete existing data or content.

Arguments:

| Argument           | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`         | boolean           | Update only: true moves it to the trash, false restores it. Archiving is the only removal path — there is no hard delete.                                                                                                                                                                                                                                                                                                                       |
| `clear`            | array of string   | One of: `description`. Update only: property names to unset (description). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary.                                                                                                                                                                                                                           |
| `definition`       | object or array   | Either (a) the aggregation clause — what get_content's "definition" include returns for a measure (one-element array or bare clause) and what execute_query takes in stages[0].aggregation — reassembled onto `table_id`; or (b) a full single-stage query ("lib/type": "mbql/query") holding exactly one aggregation. No filters, breakouts, joins, expressions, or limits. May reference other measures but not metrics; cycles are rejected. |
| `description`      | string            | Optional human-readable description.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `id`               | integer or string | Numeric id of the measure to update. 21-character entity_id of the measure to update.                                                                                                                                                                                                                                                                                                                                                           |
| `method`           | string            | One of: `create`, `update`. "create" makes a new measure (requires `table_id`, `name`, `definition`); "update" edits the one named by `id` (requires `revision_message`).                                                                                                                                                                                                                                                                       |
| `name`             | string            | Create only (editable on update): display name of the measure.                                                                                                                                                                                                                                                                                                                                                                                  |
| `revision_message` | string            | Update only, required: a short sentence describing the change, recorded in the revision history.                                                                                                                                                                                                                                                                                                                                                |
| `table_id`         | integer           | Create only: numeric table id (tables have no entity_ids). A bare-clause `definition` is reassembled into a query on this table; a full-query one must name this same source table — a mismatch is a teaching error, not silently reconciled.                                                                                                                                                                                                   |

## Metric write

- Tool name: `metric_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Can overwrite or delete existing data or content.

Arguments:

| Argument              | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `archived`            | boolean           | Update only: true moves the metric to the trash, false restores it. Archiving is the only removal path — there is no hard delete.                                                                                                                                                                                                                                                                                  |
| `clear`               | array of string   | One of: `description`, `collection_position`. Update only: property names to unset (description, collection_position). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary.                                                                                                                                                  |
| `collection_id`       | integer or string | Numeric id of the collection to save the metric in. 21-character entity_id of the collection, or "root" for the root collection.                                                                                                                                                                                                                                                                                   |
| `collection_position` | integer           | Pins the metric at this position in its collection.                                                                                                                                                                                                                                                                                                                                                                |
| `definition`          | object            | The metric's query: a full single-stage query holding exactly one aggregation and at most one breakout. Accepts the same numeric-id shape get_content's "definition" include returns for a metric and execute_query takes. Pass this or query_handle, not both.                                                                                                                                                    |
| `description`         | string            | Optional human-readable description.                                                                                                                                                                                                                                                                                                                                                                               |
| `display`             | string            | One of: `table`, `bar`, `line`, `pie`, `scatter`, `area`, `row`, `combo`, `pivot`, `scalar`, `smartscalar`, `gauge`, `progress`, `funnel`, `map`, `waterfall`, `sankey`. How the metric's result is visualized. Defaults to "scalar" — right for a single number, wrong for a metric with a grouping, which usually wants "line" (a grouping over time) or "bar" (a grouping over categories). Editable on update. |
| `id`                  | integer or string | Numeric id of the metric to update. 21-character entity_id of the metric to update.                                                                                                                                                                                                                                                                                                                                |
| `method`              | string            | One of: `create`, `update`. "create" makes a new metric (requires `name` and one query source); "update" edits the one named by `id`.                                                                                                                                                                                                                                                                              |
| `name`                | string            | Create only (editable on update): display name of the metric.                                                                                                                                                                                                                                                                                                                                                      |
| `query_handle`        | string            | A query_handle from execute_query — saves exactly the query that ran. Pass this or definition, not both.                                                                                                                                                                                                                                                                                                           |

## Question write

- Tool name: `question_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Can overwrite or delete existing data or content.

Arguments:

| Argument                 | Type              | Description                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`               | boolean           | Update only: true moves it to the trash, false restores it.                                                                                                                                                                                                                               |
| `cache_ttl`              | integer           | Legacy per-question cache TTL. Stored and echoed back, but no longer read: caching is configured through cache policies in admin settings.                                                                                                                                                |
| `card_type`              | string            | One of: `question`, `model`. "question" (default) or "model".                                                                                                                                                                                                                             |
| `clear`                  | array of string   | One of: `description`, `collection_position`, `cache_ttl`. Update only: property names to unset (description, collection_position, cache_ttl). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary. |
| `collection_id`          | integer or string | Numeric id of the collection to save it in. Omit on create for your personal collection. Exclusive with `dashboard_id`. Collection entity_id, or "root" for the top-level collection.                                                                                                     |
| `collection_position`    | integer           | Pin position within the collection; omit to leave it unpinned.                                                                                                                                                                                                                            |
| `column_metadata`        | array of object   | Per-column result metadata to set, matched to the query's result columns by name. Typically used with card_type "model".                                                                                                                                                                  |
| `dashboard_id`           | integer or string | Numeric id of a dashboard to save the question inside; it inherits that dashboard's collection. On update, moves the card into that dashboard. Exclusive with `collection_id`. 21-character entity_id of the dashboard to save the question inside.                                       |
| `description`            | string            | One or two sentences on what the question answers.                                                                                                                                                                                                                                        |
| `display`                | string            | One of: `table`, `list`, `bar`, `line`, `pie`, `scatter`, `area`, `row`, `combo`, `pivot`, `scalar`, `smartscalar`, `gauge`, `progress`, `funnel`, `map`, `waterfall`, `sankey`. Visualization type. learn("visualization-settings") covers the choice.                                   |
| `id`                     | integer or string | Numeric id of the question to update. 21-character entity_id of the question to update.                                                                                                                                                                                                   |
| `method`                 | string            | One of: `create`, `update`. "create" makes a new question or model (requires `name` and exactly one of `query_handle`, `query`, or `native`); "update" edits the one named by `id`.                                                                                                       |
| `name`                   | string            | Question title. Required on create.                                                                                                                                                                                                                                                       |
| `native`                 | object            | A native SQL query to save: {database_id, sql, template_tags?}. Requires the agent:sql:run scope and the mcp-execute-sql-enabled setting. Call learn("native-parameters") before first passing template_tags.                                                                             |
| `query`                  | object            | An inline query with numeric ids and a top-level database id (learn("query-dialect")). Prefer `query_handle`.                                                                                                                                                                             |
| `query_handle`           | string            | A handle returned by execute_query, execute_sql, or visualize_query. The preferred query source on create: it saves exactly the query that tool validated.                                                                                                                                |
| `visualization_settings` | object            | Display settings for the chosen `display`; learn("visualization-settings") lists the keys.                                                                                                                                                                                                |

## Render drill through

- Tool name: `render_drill_through`
- Permission scope: `agent:query:run` — Run queries against your connected databases and see the results
- Read-only.
- Interactive: renders a chart inline in your AI client. Only available in clients that support inline visualizations.

Arguments:

| Argument       | Type   | Description                                                                                                      |
| -------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `query_handle` | string | The handle UUID from the user's drill-through message. Pass it through verbatim — do not run the query yourself. |

## Run saved question

- Tool name: `run_saved_question`
- Permission scope: `agent:query:run` — Run queries against your connected databases and see the results
- Read-only.

Arguments:

| Argument     | Type              | Description                                                                                                                                                                        |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | integer or string | Numeric card id. A 21-character entity_id.                                                                                                                                         |
| `parameters` | array of object   | Parameter values to apply, each {id, value} where id is the parameter's id or slug. The card's stored target and type always apply. Discover a card's parameters with get_content. |
| `row_limit`  | integer           | Range: 1 to 2000. Maximum rows to return in this call (default 100, max 2000).                                                                                                     |

## Search

- Tool name: `search`
- Permission scope: `agent:content:read` — See your Metabase content and data structure
- Read-only.

Arguments:

| Argument           | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`         | boolean           | true searches the trash instead of active content.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `collection_id`    | integer or string | Numeric collection id. A 21-character entity_id, or "root" for no scoping.                                                                                                                                                                                                                                                                                                                                                                                             |
| `created_by`       | string            | One of: `me`. "me" restricts results to items you created. Only question, model, metric, dashboard, document, measure, and action index a creator.                                                                                                                                                                                                                                                                                                                     |
| `fields`           | array of string   | Dot-paths picked from the detailed row shape, item-relative (e.g. "collection.name"). Mutually exclusive with response_format.                                                                                                                                                                                                                                                                                                                                         |
| `limit`            | integer           | Range: 1 to 50. Maximum results to return (default 20, max 50).                                                                                                                                                                                                                                                                                                                                                                                                        |
| `offset`           | integer           | Number of results to skip, for paging (default 0).                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `recent`           | boolean           | true returns your recently viewed items instead of searching. Combines with type (only question, model, metric, dashboard, document, collection, table are tracked) but not with queries or other filters. Reflects Metabase UI views only — content you read through these tools is not recorded as a view, so a fresh token's recents can be empty even after get_content calls in the same session.                                                                 |
| `response_format`  | string            | One of: `concise`, `detailed`. concise (default) returns {type, id, name, collection_path, description} rows; detailed returns the full search-result rows.                                                                                                                                                                                                                                                                                                            |
| `semantic_queries` | array of string   | A natural-language query matched by semantic similarity when a semantic engine is active (keyword-ranked otherwise). Each query runs separately; results are merged by rank.                                                                                                                                                                                                                                                                                           |
| `term_queries`     | array of string   | A keyword query matched against names and descriptions via full-text search. Each query runs separately; results are merged by rank.                                                                                                                                                                                                                                                                                                                                   |
| `type`             | array of string   | One of: `question`, `model`, `metric`, `measure`, `segment`, `dashboard`, `document`, `collection`, `table`, `database`, `snippet`, `transform`, `action`. Restrict results to these entity types. "snippet" is served by a separate listing (snippets aren't in the search index), requires the agent:content:read scope, and must be requested on its own — combining it with other types is an error. Omit to search every type this tool supports except snippets. |

## Segment write

- Tool name: `segment_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Can overwrite or delete existing data or content.

Arguments:

| Argument           | Type              | Description                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`         | boolean           | Update only: true moves it to the trash, false restores it. Archiving is the only removal path — there is no hard delete.                                                                                                                                                                                                                            |
| `clear`            | array of string   | One of: `description`. Update only: property names to unset (description). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary.                                                                                                                                |
| `definition`       | object or array   | Either (a) an array of filter clauses — what get_content's "definition" include returns for a segment and what execute_query takes in stages[0].filters — reassembled onto `table_id`; or (b) a full single-stage query. Filters only: no aggregations, breakouts, joins, expressions, or limits. May reference other segments; cycles are rejected. |
| `description`      | string            | Optional human-readable description.                                                                                                                                                                                                                                                                                                                 |
| `id`               | integer or string | Numeric id of the segment to update. 21-character entity_id of the segment to update.                                                                                                                                                                                                                                                                |
| `method`           | string            | One of: `create`, `update`. "create" makes a new segment (requires `table_id`, `name`, `definition`); "update" edits the one named by `id` (requires `revision_message`).                                                                                                                                                                            |
| `name`             | string            | Create only (editable on update): display name of the segment.                                                                                                                                                                                                                                                                                       |
| `revision_message` | string            | Update only, required: a short sentence describing the change, recorded in the revision history.                                                                                                                                                                                                                                                     |
| `table_id`         | integer           | Create only: numeric table id (tables have no entity_ids). A bare-clause `definition` is reassembled into a query on this table; a full-query one must name this same source table — a mismatch is a teaching error, not silently reconciled.                                                                                                        |

## Subscription write

- Tool name: `subscription_write`
- Permission scope: `agent:delivery:write` — Set up scheduled delivery of your data to email addresses and Slack channels it chooses
- Creates or changes content.

Arguments:

| Argument        | Type              | Description                                                                                                                                                                                                     |
| --------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`      | boolean           | Update only: true pauses the subscription and moves it to the trash, false restores it. This is the only removal path.                                                                                          |
| `channel`       | string            | One of: `email`, `slack`. Where to deliver. Defaults to "email" on create; on update, to the subscription's channel when it has exactly one.                                                                    |
| `dashboard_id`  | integer or string | Numeric id of the dashboard to deliver. 21-character entity_id of the dashboard to deliver.                                                                                                                     |
| `id`            | integer or string | Numeric id of the subscription to update. 21-character entity_id of the subscription to update.                                                                                                                 |
| `method`        | string            | One of: `create`, `update`. "create" subscribes to the dashboard named by `dashboard_id`; "update" edits the subscription named by `id`.                                                                        |
| `parameters`    | array of object   | Filter values applied to the dashboard before it is sent, making a filtered subscription. Only ids the dashboard actually has are accepted.                                                                     |
| `recipients`    | array             | Who gets the email: numeric user ids, or raw email addresses for people without a Metabase account. Defaults to you. On update this replaces the current list. Numeric id of a Metabase user. An email address. |
| `schedule`      | object            | When to deliver. Metabase sends at the top of the hour, in the instance's report time zone.                                                                                                                     |
| `skip_if_empty` | boolean           | When true, no email is sent if every card comes back empty. Default false.                                                                                                                                      |
| `slack_channel` | string            | Slack channel or username to post to, e.g. "data-team". Required for channel "slack".                                                                                                                           |

## Transform write

- Tool name: `transform_write`
- Permission scope: `agent:content:write` — Create, edit and trash Metabase content
- Creates or changes content.

Arguments:

| Argument        | Type              | Description                                                                                                                                                                                                                                                   |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clear`         | array of string   | One of: `description`. Update only: property names to unset (description). Needed because a null cannot say "clear this" — strict clients fill every unset property with null, so nulls are stripped at the boundary.                                         |
| `collection_id` | integer or string | Numeric id of the transform folder to file the transform in. 21-character entity_id of the transform folder, or "root" for the top level of the transforms tree.                                                                                              |
| `definition`    | object            | The transform's source: {"type": "query", "query": …}, the shape get_content's "definition" include returns for a transform. The query inside is the same numeric-id dialect execute_query takes, and may be native SQL. Pass this or query_handle, not both. |
| `description`   | string            | Optional human-readable description.                                                                                                                                                                                                                          |
| `id`            | integer or string | Numeric id of the transform to update. 21-character entity_id of the transform to update.                                                                                                                                                                     |
| `method`        | string            | One of: `create`, `update`. "create" makes a new transform (requires `name`, `target`, and one query source); "update" edits the one named by `id`.                                                                                                           |
| `name`          | string            | Create only (editable on update): display name of the transform.                                                                                                                                                                                              |
| `query_handle`  | string            | A query_handle from execute_query or execute_sql — saves exactly the query that ran. Pass this or definition, not both.                                                                                                                                       |
| `tag_ids`       | array of integer  | Numeric ids of transform tags to label the transform with; jobs select transforms by tag. Replaces the current list — pass [] to clear it.                                                                                                                    |
| `target`        | object            | The table the transform writes, recreated on every run. On update this patches the current target, so passing only `name` renames the table and keeps its schema. A target read back from get_content can be passed back unchanged.                           |

## Visualize query

- Tool name: `visualize_query`
- Permission scope: `agent:query:run` — Run queries against your connected databases and see the results
- Read-only.
- Interactive: renders a chart inline in your AI client. Only available in clients that support inline visualizations.

Arguments:

| Argument       | Type   | Description                                                                                                                                                                                                                                                   |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`       | string | The user's original request, recorded with a freshly minted handle for the iframe's feedback flow. Ignored alongside `query_handle`: the stored prompt is fixed at mint time and there is no update path, so pass `prompt` on the call that mints the handle. |
| `query`        | object | A fresh query in the same dialect execute_query takes: numeric table/field ids from browse_data, never base64. Exactly one of query \| query_handle.                                                                                                          |
| `query_handle` | string | A query_handle from a previous execute_query / execute_sql call — visualizes the exact stored query, MBQL or native SQL. Preferred over query. Exactly one of query \| query_handle.                                                                          |

# Event table settings

Which column is the timestamp, the person, the session, the event name and the URL path is a fact about the table, not about one analysis. This plan moves those column roles into table metadata, set once per table in Data Studio. Analyses only read them. Which events are pageviews, and how their URL paths are cleaned, are table settings the same way (see [Pageviews and path cleaning](#pageviews-and-path-cleaning)).

It answers "Where roles live" and "Whole schemas, not single roles" from the open questions in [analysis-settings.plan.md](analysis-settings.plan.md#open-questions-column-roles), and part of "what's required to be considered an 'event table'" in [product-analytics.md](product-analytics.md).

## Two layers

A setting's value comes from the first layer that has a valid one:

1. **The table, as a user set it.** Set in Data Studio's Events tab. Stored on `metabase_table_user_settings.event_settings`.
2. **The table, as sync detected it.** Written by sync's table classifier. Stored on `metabase_table.detected_event_settings`.

Each layer is validated on read, so a column that no longer exists falls through to the next layer.

An earlier version had a third layer on top: an analysis could override the table's settings, in an "Event table settings" modal, and store them in its URL and saved card. It was dropped to keep one place to set them. Analyses ignore table settings stored before then.

There's no guessing in the browser any more: `ROLE_RULES` goes away. A role that nobody set and sync didn't detect is empty. If it's a required role (timestamp or person), Data Studio shows a warning on the Events tab and analyses say the table isn't set up, rather than silently picking the first datetime column.

So Data Studio does have defaults: the detected values. They're real values that sync wrote, with the schema they came from, not a guess the page makes each time it renders.

## Detection

The classifier recognizes whole schemas, not single columns. Roles come in sets, so a known export format names all of them at once.

`classify-table!` reads the table's fields and tries each known schema in order. A schema matches on column names: every required role's column and every signature column (columns that tell apart schemas sharing role columns) must exist. A match:

- sets `entity_type` to `:entity/EventTable`;
- writes `detected_event_settings`: the schema's name, the roles it assigns and its pageview rule.

A column with the right name but the wrong type matches the schema without playing its role. GA4's `event_timestamp` is microseconds in an integer, so a GA4 table is an event table with no timestamp, and the warning asks for one. Mixpanel's `time` is the same when an export stores it as seconds.

A table that matches no schema is no longer an event table because of its name. The old `event`, `checkin` and `log` name patterns are gone, which also takes those tables off X-rays' event table template. Someone can still set the entity type to Event by hand in Data Studio and fill in the roles there. The Internal Metabase Database's `v_audit_log`, `v_query_log` and `v_view_log` were event tables in the instance analytics content; they're generic tables now.

The schemas sketched for the prototype. Apart from Track's, they were written from memory of each vendor's docs and haven't been checked against real exports, so validate them before relying on them (see "Event schemas" in [post-prototype.md](post-prototype.md#event-schemas)):

| Schema | Timestamp | Person | Session | Event name | URL path | Pageviews |
|---|---|---|---|---|---|---|
| Metabase Track (`pa_events_resolved`) | `created_at` | `person_id` | `session_id` | `event_name` | `url_path` | `event_type = 1` |
| Segment, RudderStack `tracks` | `timestamp` | `user_id` | | `event` | `context_page_path` | |
| Snowplow `atomic.events` | `derived_tstamp` | `domain_userid` | `domain_sessionid` | `event_name` | `page_urlpath` | `event_name = 'page_view'` |
| PostHog export | `timestamp` | `distinct_id` | | `event` | | `event = '$pageview'` |
| Amplitude export | `event_time` | `user_id` | `session_id` | `event_type` | | `event_type = '[Amplitude] Page Viewed'` |
| Mixpanel export | `time`, when it's a date | `distinct_id` | | `event` | | `event = '$mp_web_page_view'` |
| GA4 export (`events_*`) | `event_timestamp`, never a date | `user_pseudo_id` | | `event_name` | | `event_name = 'page_view'` |

A pageview rule is only detected when its column exists with the right type: a number for Track's `event_type`, text for the rest.

Track is recognized in the shape of the prototype's `pa_events_resolved`, with people stitched into `person_id`. Track's own `pa_events` isn't an event table: in production, it should look like `pa_events_resolved`, so there aren't two shapes to choose between.

Gaps, all of them because a role isn't a plain column:

- **GA4:** `event_timestamp` is microseconds in an integer, and the session id and page URL are inside `event_params`.
- **PostHog:** the session id and path are in `properties`.
- **Track's `pa_events`:** the stitched person is `coalesce(distinct_id, visitor_id)`.
- **Segment:** the anonymous person is `anonymous_id`, and pageviews are in a separate `pages` table.
- **Pageviews without a URL path:** PostHog, Amplitude, Mixpanel and GA4 have a detected pageview rule but no URL path column, since the page is a property. The pageview setting is hidden without a URL path, so their rules do nothing until the URL path can be an expression.

Those need roles that can be expressions ("Roles that aren't plain columns" in the analysis settings plan). The prototype leaves them empty, so the table is recognized as an event table and the warning asks for the rest.

## Storage

- `metabase_table.detected_event_settings`: JSON, written only by sync, like `entity_type`. Sync's classifiers may set it.
- `metabase_table_user_settings.event_settings`: JSON, written by `PUT /api/table/:id`. It holds only what the user changed.

Both are keyed like the analysis settings (`"columns.person": "user_id"`), so the same definitions read and validate them. The detected one also names its schema. Besides the roles, they can hold `pageviews`, and the user's can hold `path_cleaning`. Sync doesn't detect path cleaning: its default is in the frontend.

They store column names, not field IDs, like the analysis settings do. Names are portable, so serialization copies both blobs as they are.

`GET /api/table/:id` and `query_metadata` return both. They're merged on the frontend by the settings engine, layer by layer, not in SQL. A blob can't be coalesced as a whole, because each key comes from its own layer.

Writing is table metadata permission, unchanged: admins on OSS, and `manage-table-metadata` on EE.

## Frontend

A new shared module, `metabase/event-tables`, sits below both product analytics and Data Studio. Both are feature modules, so neither can import the other. It holds:

- **The typed settings layer**, moved from `product-analytics/settings`: the definition types, the engine wrappers and `withWidgetProps`. It has two consumers: the event table settings and each analysis's own settings. If a third one appears outside event tables, it belongs in `viz-core`.
- **The event table setting definitions.** Their context is `EventTableContext` (the table). Dependencies between settings are written once. For example, path cleaning reads the URL path role.
- **The table's computed settings:** the user's values over the detected ones, and whether the table is set up (an event table with an event time and a person).
- **The widgets:** the column picker, pageviews and path cleaning.
- **Sections.** Each definition's `getSection` puts it in one of Data Studio's three sections: Required, Optional, and Pageviews (optional), which holds the URL path, pageviews and path cleaning. The settings layer takes the section names as a type parameter, so analyses keep theirs (toolbar, setup and advanced).

**Data Studio.** `TableSection` gets an Events tab, right after Details, for tables whose entity type is Event. It shows a warning icon until product analysis can use the table: while a required role is empty, or while the table isn't an event table. The tab renders the definitions with `ChartSettingsWidget`, and a change saves `event_settings`. For someone who can't edit the table's metadata, the tab is read-only.

- **Detected schema.** The top of the tab says which schema sync detected ("Detected as a Snowplow event table.").
- **Reset.** Once the table has saved settings, a "Reset to Snowplow defaults" button at the bottom asks for confirmation, then clears `event_settings`, path cleaning rules included. It's only there with a detected schema, since without one there's nothing to go back to. Table setting changes aren't in the audit log or revision history, so the undo toast is the only way back from a reset.

The tab also shows when a link asks for it, such as product analytics' "Set up in Data Studio" on a table that isn't an event table. There, the tab says only tables with an Event entity type can be used in product analysis, with a "Set entity type to Event" button, and its settings stay disabled until it's clicked. The tab stays while the table is open, so checking the entity type on Details doesn't take it away. Entity type is the one switch: saving a setting never changes it, the table picker filters by it, and an admin can take a misdetected table out by changing it. Changing it away from Event keeps the table's event settings, so changing it back restores them.

**Product analytics.** An analysis's computed settings include the table's, read from the table: their definitions have no widget and never accept a stored value. So downstream code reads `settings["columns.person"]` like any other setting, and nothing in an analysis can change it.

- **Picking a table.** The table picker lists only tables that are set up, and searches only them. The list endpoint returns no fields, so a role's column is assumed to still exist; if it doesn't, the analysis says the table isn't set up. "Browse all" opens the full data picker. Someone who can open Data Studio can pick any table there, to set it up. For anyone else, tables that aren't set up are disabled, with a tooltip that says to ask an admin. Data analysts can open Data Studio but may lack metadata permission on a table; checking that per table would mean a slow request for every table, so their setup screen tells them to ask an admin instead. The data picker leaves out the root and personal collections, which can't hold tables, and keeps the library, which holds published ones.
- **Missing roles.** A table is set up by the same test everywhere: the picker's, which includes the entity type. While the table isn't an event table, or has no event time or person column, the chart area says the table isn't set up yet, instead of running a query. It links someone who can edit the table to Data Studio's Events tab, and tells anyone else to ask an admin.
- **Columns one analysis needs.** Others are required by one analysis: Paths needs an event name or a URL path to name its steps, and names them by the pageviews setting (see below). It asks for them the same way, with Data Studio or an admin, and the table isn't flagged in Data Studio, since other analyses can use it.
- **ClickHouse only.** The prototype's SQL is ClickHouse's. On a table in another database, once it's set up, the chart area says so in place of the chart, and no query runs. Setting up the table still works, so it can be tried anywhere.

## Later

- **More table settings.** The first-seen column is per table too. It joins with the same pattern, as another definition.
- **Change history.** Table settings changes aren't logged anywhere, so a mistake can't be looked up or undone after the toast.
- **Roles as expressions.** See the gaps above, and [Roles as expressions](#roles-as-expressions).
- **Who can write.** Non-admins on OSS would need a new, lower permission. Changing a table's settings changes every analysis on it, which is why it stays table metadata permission for now.
- **Following the table.** Every analysis follows its table's settings, and none can opt out. Whether a saved analysis should keep the settings it was saved with is open. See "Sparse settings" in [post-prototype.md](post-prototype.md#sparse-settings).

## Pageviews and path cleaning

Both depend on the URL path role, and are hidden without one.

**Pageviews** (`pageviews`) says which events are pageviews:

- **None.** Paths names every step by its event name.
- **Every event.** Paths names every step by its URL path, as on a table that only holds pageviews.
- **Events where a column has a value.** Paths names pageviews by their URL path and other events by their event name. The value is a number or text, matching the column's type. The base query adds an `is_pageview` flag for it, like the flags for segments.

Without an event name column, only "Every event" is valid, because Paths has nothing else to name steps by. The default is the detected rule when it's valid on the table, else none, or every event when there's no event name. In the widget, changing the column clears the value, and nothing saves until there's a new one, so the old value isn't saved against the new column.

This replaces the per-analysis pageview spec and `events/pageviews.ts`, which recognized Umami and Track by an `event_type` number column.

**Path cleaning** (`path_cleaning`) is an ordered list of rules, each a regex `pattern`, a `replacement` and an optional `description`. Every rule applies, in order, each to the previous one's result. With a URL path, the default is four generic rules: query strings and fragments, UUIDs, numbers, and trailing slashes. An empty list turns cleaning off.

- **Query.** The prototype applies the rules in its ClickHouse SQL, as nested `replaceRegexpAll` calls on the URL path in the base projection, outside MBQL. In production, cleaning would compile to an MBQL `regex-replace` expression on the page role (see "Cleaning URL paths" in [post-prototype.md](post-prototype.md#cleaning-url-paths)).
- **Dialect.** Patterns and replacements are ClickHouse's, and so are the defaults. They aren't validated in the browser, whose regular expressions are a different dialect; a rule only needs a pattern. A stored list with an invalid rule falls back to the defaults as a whole. See "Regex dialects" in post-prototype.md.
- **Widget.** One row per rule: pattern, replacement, a description button and remove. The list saves when the focus leaves it. Hovering the description button previews the description with an "Edit description" link, and clicking either edits it in place.

## Roles as expressions

The gaps are two different problems.

**Timestamps stored as numbers.** GA4's microseconds and Mixpanel's seconds don't need expressions. Metabase already coerces a numeric field to a date (`Coercion/UNIXMicroSeconds->DateTime`, `Coercion/UNIXSeconds->DateTime`), and a coerced field's effective type is a date, which is what both the classifier and the frontend check. So these work today once someone coerces the field in the table metadata. The classifier could set the coercion itself when it recognizes the schema, but coercion is shared field metadata that changes the field everywhere, not just for event analysis.

**Roles that are a computation.** The stitched person (`coalesce(distinct_id, visitor_id)`), a key in PostHog's `properties`, or a value in GA4's `event_params`. These need a role to hold an MBQL expression instead of a column name:

- **Storage:** a role is a column name or an expression. Expressions refer to fields by id, so they need portable references to serialize (see "IDs in saved analyses" in [post-prototype.md](post-prototype.md)).
- **Base query:** `buildBaseQuery` finds each role's column by name. An expression role becomes a custom column on the base query instead, selected under the planner's name.
- **Validation:** checked with Lib, not by looking the name up in the table's fields.
- **Picker:** the column picker needs a way into the query builder's expression editor.
- **Detection:** each schema's classifier entry names its expressions, not just columns.

Some aren't reachable even then. GA4's `event_params` is an array of structs in BigQuery, which needs an `UNNEST` that MBQL can't express. PostHog's `properties` work when JSON unfolding gives its keys their own fields.

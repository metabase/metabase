# Product analytics: after the prototype

Work we've decided is needed, but not for the prototype. Each section stands on its own.

## Source of truth for an analysis

An analysis is defined by its analysis settings, like `funnel.view` ("How to display the funnel"). They use the viz settings engine, so defaults, validation, dependencies between settings and widgets come for free. But they're used differently: viz settings take a query result and compute how to draw it, while analysis settings build the query itself.

Today the source of truth is split:

- **Dashboards and subscriptions** run the query saved with the card.
- **The event analysis builder** throws that query away when it reopens the card, and builds a new one from the saved settings.

So the two can disagree. If we change how queries are built from settings, a saved analysis shows one thing on a dashboard and another when opened. Before this ships, decide which one is the source of truth and when a query gets rebuilt.

### Sparse settings

Like viz settings, analysis settings are sparse: only what the user changed is saved, and everything else is a default computed on read. With viz settings that's caused trouble, because changing a default changes every existing card that relied on it. We should consider a different approach for analysis settings.

Table settings make this harder to decide. An analysis that never changed its column roles follows the table's (see [event-table-settings.plan.md](event-table-settings.plan.md)), so an admin changing them changes every such analysis:

- **Against following the table:** someone who saved an analysis was happy with how it looked, and an admin's change later shouldn't change it under them.
- **For following it:** a fix should reach every analysis, and a table whose columns change shouldn't leave analyses pointing at a column that's gone. For path cleaning especially, analyses that each kept their own copy of the rules would end up with slightly different cleaning scattered across them.

So the answer may differ per setting: some follow the table, and others are fixed when the analysis is saved.

## IDs in saved analyses

The prototype's settings refer to tables and fields by their numeric ids, which differ between instances, so they don't survive serialization, and dependency tracking can't see them. Don't copy this when hardening. Event table settings name columns instead, which are portable.

## Event schemas

Sync recognizes event tables by matching their columns against known schemas ([event-table-settings.plan.md](event-table-settings.plan.md#detection)). Apart from Track's, the prototype's schemas were written from memory of each vendor's docs, not checked against real exports. Don't copy them as they are.

### Validate them

Check each one against the vendor's current docs, and against a real export where there's one to read:

- **GA4:** Google's public sample export (`bigquery-public-data.ga4_obfuscated_sample_ecommerce`) has the real columns.
- **Snowplow:** Snowplow publishes the `atomic.events` table definition.
- **Segment, RudderStack, Amplitude, Mixpanel, PostHog:** their warehouse and export docs, and the dbt packages built on them, which list the source columns they read.

Keeping them current is mostly a matter of watching for changes: vendors rarely rename warehouse columns, because their customers' SQL depends on them, but they do add them. The matching only needs a few columns per schema, so added columns don't break it; renames do. A scheduled job, rather than a test, could compare each schema with the vendor's published one, such as GA4's sample dataset.

### Sources split across tables

An event table is one table, but some sources split their events across several:

- **Segment and RudderStack** write `tracks` (every event, with only the common columns), `pages` (pageviews, with `path` and no event name), `identifies`, and one table per event with its properties. The prototype only recognizes `tracks`. The per-event tables have the same common columns, so each of them is likely recognized as an event table too, and fills the table picker.
- **GA4** exports one table per day (`events_20261029`, plus `events_intraday_…`). Each day is recognized as its own event table, while analyses need every day at once, which BigQuery reads with a wildcard (`events_*`).

Outside Metabase, people usually model these into one events table first: a view or dbt model that unions `tracks` and `pages` (pageviews as an event named for the page), stitches `anonymous_id` to `user_id` through `identifies`, and for GA4 reads the wildcard. Here that means a view in the warehouse, or a model once the table picker accepts models. Recognizing a source should then mean recognizing the modelled table, and not offering the raw pieces.

### Recognize tables when sync finds them

Detection runs in `classify-table!`, which is part of sync's analyze phase. Scheduled syncs skip that phase when the database's `is_full_sync` is off. The admin form turns it off when "Choose when syncs and scans happen" is on and "Scanning for filter values" is set to anything but "Regularly, on a schedule". Admins often do that so Metabase doesn't query their warehouse.

On those databases, a new table shows up in the table picker but is never recognized as an event table. Recognition waits for a manual database sync, which needs database write permission. For example, someone builds a view on the raw events that filters them or adds properties, and keeps the column names. Detection would recognize it, but it never runs. Without permission to edit table metadata, they're stuck until an admin runs a sync or sets the table up by hand.

Detection doesn't need the analyze phase. It reads only column names and types, which the metadata phase has already stored in the app DB, so it never queries the warehouse. Move table classification to the end of the metadata phase, outside the `is_full_sync` check. Field classification depends on fingerprints, which do query the warehouse, so it should stay in analysis. Then a table is recognized as soon as the picker shows it, however the admin configured scanning.

Users without metadata permissions will still need another way to set columns in some cases: GA4, whose timestamp is never detected; columns that were renamed; and columns whose types don't match the schema.

## Cleaning URL paths

Paths that name pageviews by their URL need the URLs cleaned first. Without cleaning, real data turns into a long tail of nodes that each appear once:

- IDs in the path: `/dashboard/123` and `/dashboard/456` should both be `/dashboard/:id`.
- Query strings and fragments: `/pricing?ref=nav#plans` should be `/pricing`.
- Full URLs: GA4 stores `page_location` as `https://example.com/pricing?...`, not a path.
- Smaller things: trailing slashes, and case.

PostHog has user-defined cleaning rules for this. Each rule is a regex and an alias, and every rule is applied in order with `replaceRegexpAll`, each one to the previous one's result.

### Proposal: the page is an expression

The page role (`columns.url_path`) should hold an expression, not only a column name. [analysis-settings.plan.md](analysis-settings.plan.md) already says that for roles in general ("Roles that aren't plain columns"). Cleaning is then just a richer page expression, so it doesn't need a role of its own.

What MBQL has today:

| Need | MBQL today |
|---|---|
| Full URL to path | `path(url)`. `host`, `domain` and `subdomain` exist too. |
| Strip the query string | `splitPart(url, "?", 1)`, or `regexextract` |
| "If it matches, use this name" | `case(...)` with `regexextract` |
| Replace an ID segment wherever it appears | **Missing**: there's no regex replace, only literal `replace` |

With what's there, the shape is flat rather than nested: one `case` whose branches are tried in order, the first match wins, and the rest are skipped:

```
case(
  regexextract([Path], "^/dashboard/[0-9]+") != "", "/dashboard/:id",
  regexextract([Path], "^/question/[0-9]+") != "", "/question/:id",
  [Path]
)
```

That works, but it needs one branch per URL shape. `/org/1/dashboard/2` and `/org/1/settings` are two branches, not one rule for "any number segment".

**Add `regex-replace` to MBQL.** It's the one missing piece. With it, a handful of generic rules cover most sites:

- numeric segments → `:id`
- UUID segments → `:id`
- strip `?…` and `#…`

The rules chain as nested `regexReplace` calls, which is fine here, because every rule should apply, unlike the first-match `case` above. Every warehouse we care about has a native regex replace:

| Warehouse | Function |
|---|---|
| ClickHouse | `replaceRegexpAll` |
| Postgres | `regexp_replace(…, 'g')` |
| BigQuery, Snowflake, MySQL 8, H2 | `REGEXP_REPLACE` |

So it can be a driver feature, the way `:regex` gates `regexextract`.

**UX.** Users shouldn't edit the expression. They'd see an ordered list of rules: pattern, replacement and a description. The list compiles to the expression, with good defaults for the generic rules.

**Where it lives.** It's per table, not per analysis, so it belongs with the column roles in table metadata ([event-table-settings.plan.md](event-table-settings.plan.md)). Meanwhile, a model with a cleaned-path custom column works today with no new UX, once the table picker accepts models.

The prototype has the list as the `path_cleaning` table setting, and applies it in its ClickHouse SQL with `replaceRegexpAll`, outside MBQL. It checks only that each pattern isn't empty.

### Regex dialects

Every database has its own regular expressions. Metabase passes `regexextract`'s pattern to the database as written, and rules would work the same way, so a rule is written in its database's dialect. They differ in two ways.

**Patterns.** RE2 (ClickHouse, BigQuery) has no lookarounds or backreferences. Postgres, Java (Spark, Databricks, H2) and ICU (MySQL 8) have both, and Snowflake's are POSIX extended. Most simple rules, like the defaults, mean the same in all of them. A pattern can't be translated from one dialect to another.

**Replacements.** A group in a replacement is `\1` in ClickHouse, BigQuery, Snowflake and Postgres, and `$1` in Java and MySQL. That one can be translated: rules could be stored in one syntax, and each driver rewrites it.

These are from memory, so check each driver before relying on them. What follows:

- **The default rules are ClickHouse's.** `getDefaultPathCleaningRules` in `event-tables/path-cleaning.ts` is written for ClickHouse: the trailing slash rule's `\1` is `$1` in Java and MySQL, and the number and UUID rules end in `\b`, which isn't a word boundary in every dialect (Postgres's is `\y`). Each database needs its own defaults, or the replacement translated per driver as above. Don't apply them as they are elsewhere.

- **Validation belongs to the database.** The browser's regular expressions are a third dialect, so a check there is wrong for some databases. Saving a rule could instead run it once on the warehouse against a literal, which only fails when the pattern does.
- **A preview, if there is one, runs on the warehouse.** PostHog has a tester in the browser that copies RE2's syntax, which works because they only have ClickHouse. Ours would run the rules against a sample of the table's real paths, so it's right for every dialect. Until then, general regex testers like regex101 cover most of it.

## Recognizing pageviews in other schemas

Sync detects a pageview rule with each event schema (see "Detection" in [event-table-settings.plan.md](event-table-settings.plan.md#detection)). Where the page is, and what's still missing:

| Source | Pageview | Page |
|---|---|---|
| GA4 export | `event_name = 'page_view'` | `page_location` in `event_params` |
| Snowplow | `event_name = 'page_view'` | `page_urlpath` |
| PostHog export | `event = '$pageview'` | `properties.$pathname` |
| Plausible | `name = 'pageview'` | `pathname` |
| Amplitude export | `event_type = '[Amplitude] Page Viewed'` | a property |
| Mixpanel export | `event = '$mp_web_page_view'` | `$current_url` |
| Segment, RudderStack | a separate `pages` table | `path` |

- **Page as a property:** GA4, PostHog, Amplitude and Mixpanel have a pageview rule but no URL path column, so the rule does nothing until the URL path role can be an expression.
- **Plausible** isn't a detected schema yet.
- **Segment:** the separate `pages` table needs a union with `tracks` before any of this applies.

## Which events insights compare people by

Lifecycle insights compare people by the event table's saved segments: whether they did each one at least 1, 3 and 10 times in a period (`insights/event-candidates.ts`). Each segment adds a flag column to `events_base` and a `countIf` per person per period to the population, so the query slows down as segments are added. The prototype takes the first 20.

Real tables can have hundreds of segments, most of them rarely used. The plan is a notion of **popular events**: the segments (and later, raw event names) that enough people do often enough to be worth comparing by, picked from a cheap pass over recent data. Insights would only look at those.

## Funnel querying

How the funnel finds each person's run through the steps, what we measured, and the open questions for production are in [funnel-querying.md](funnel-querying.md#after-the-prototype). The open questions are join or no join per engine, database-specific fast paths, and heavy tails.

## Heavy-tailed data

Prototype analyses lean on ClickHouse in ways that may not hold up when a few people have very many events:

- per-person `groupArray` (paths);
- `ARRAY JOIN` row multiplication (funnel steps, time buckets);
- a `countIf` per flag (insights).

Before choosing each analysis's MBQL shape, benchmark it against a heavy-tailed dataset, not only typical volumes.

## Reading by date range

Analyses assume a date range reads less than the whole table. Lifecycle's `person__first_seen_at` exists so it doesn't have to read history from before the range. Whether a range actually reads less depends on the table:

- **Track:** `pa_events` is partitioned by month on `created_at`, so a range skips the months outside it. `sql/04_pa_events_resolved.sql` does the same for the prototype.
- **Columnar warehouses:** BigQuery tables are usually partitioned by date. Snowflake, Redshift and Delta skip by each block's min and max values, which works when events are loaded in time order.
- **Postgres and MySQL:** usually not partitioned, so a range often reads the whole table anyway.
- **Load time vs. event time:** a table partitioned on when rows were loaded (BigQuery's `_PARTITIONTIME`, a loader's `received_at`) skips nothing when the analysis filters on the event's own time.

Some settings read all history whatever the table: Cohorts' "first ever start event" reads every past start event, and every past event when the start is "Any event". On Track, `event_name` isn't in `pa_events`' sort key, so filtering to the start event can only skip by `event_type` (pageview or custom event). When the start is "Any event", `person__first_seen_at` could answer it without reading history.

## Draft segments

Drafts are segments made in the segments panel and not saved to the table yet. The prototype keeps them in `sessionStorage` (`segments/use-segment-drafts.ts`), so they survive a reload in the same tab and nowhere else: a new tab, another browser or a teammate doesn't see them.

So that a saved analysis still works elsewhere, an analysis that uses a draft copies its conditions: event slots, people filters and cohort breakouts all do. The copy is on its own from then on:

- **Edits don't carry through.** Changing the draft, or saving it as a segment, doesn't change the analyses that copied it. A saved segment is kept by id instead, so edits to it do.
- **Nothing ties the copy to its draft.** Only the label is kept, so an analysis can't offer to switch to the segment once the draft is saved.

After the prototype, drafts need a home on the server, per person, whether that's a draft state on the segment model or something of their own. An analysis could then keep a draft by id like a saved segment, and follow it when it's saved.

## The people table

People segments, person properties in the filter and breakout pickers, and person drills read a people table: the table the person column's foreign key points to (`getUsersTableLink` in `metabase/event-tables`). It stays a foreign key in table metadata, not a product analytics setting, so the rest of Metabase gets the implicit joins too: "Page views by company over time" in the query builder is something pure-play product analytics tools can't do.

### Only through the person column

The link has to be on the person column, because a person's segments and properties have to be the same on all their events. That takes a stitched person column, one id per person across their anonymous and identified events, as `pa_events_resolved.person_id` is:

`coalesce(distinct_id, the earliest distinct_id seen on this visitor_id, visitor_id)`

- **Without stitching, funnels break.** `coalesce(distinct_id, visitor_id)` row by row makes one person two: their cookie before signing up and their id after. A funnel from an anonymous step to signing up then converts almost no one.
- **A foreign key on another column is wrong in quieter ways.** GA4's export has `user_pseudo_id`, a browser cookie that survives logging in, and `user_id`, set only after it; as far as we know, GA stitches them only in its own reports. With `user_pseudo_id` as the person and a foreign key on `user_id`, segment membership would differ between a person's anonymous and identified events: a segment breakout takes any one of them (`actor_breakouts`), and a required segment drops their anonymous events. An earlier version of this branch allowed it and was reverted.
- **So a raw GA4 table** either counts by `user_pseudo_id`, per device, with no people table, or gets a stitched view first (the dbt-ga4 package builds one, we believe).

Limiting the link to the person column also means there's no choice between foreign keys: a column has at most one.

Open questions:

- **Where stitching happens.** In the warehouse (a view, a dbt model, or a Metabase transform), or as a person role that's an expression ([Roles as expressions](event-table-settings.plan.md#roles-as-expressions)). An expression can't have a foreign key, so that would bring back linking through another column, and with it a choice between foreign keys, and segment membership computed per person rather than per event. A window over the visitor would also only see events in the date range, so an `identify()` before the range wouldn't link up. That points to the warehouse.
- **A stitched id that isn't the people table's key**, like a generated UUID, would need a mapping to the people table. Not designed for.

### Setting it up

- **Track:** sync sets the foreign key when it recognizes `pa_events_resolved` (`link-users-table!` in `sync/analyze/classify.clj`), since ClickHouse has none to report. Sync writes only its own value, so an admin who removes the foreign key keeps it removed. It runs in the analyze phase, so it shares the delay in [Recognize tables when sync finds them](#recognize-tables-when-sync-finds-them).
- **Segment and RudderStack** ship a `users` table keyed like `tracks.user_id`, so they could be linked the same way once their schemas are validated (see [Event schemas](#event-schemas)), with the same caveat: `user_id` is empty before someone is identified. Mixpanel's and PostHog's people exports are less consistent; check real ones first.
- **Everything else:** warehouse-native customers usually have their own people table, from their app's database, beside the events, but nothing tells us which table it is. The people segments panel and the person column ask for it, with a link to the event table's fields in Data Studio for someone who can edit them.
- **Mismatched key types,** like a text person column against an integer `users.id`, can't be joined through a foreign key; they need a view or a coercion.
- **Different databases:** a people table in another database than the events can't be joined at all. On Snowflake that includes another database on the same account; on BigQuery, datasets in one project share a connection.

### Companies, and group analytics

Treating any table a foreign key reaches as an entity, with segments and properties like the people table's, is tempting, and close to PostHog's and Mixpanel's group analytics and Amplitude's accounts. But it's less direct than it looks:

- **Counting companies needs each event's company.** Those tools require the group key on every event. In warehouse data it's usually on the people table (`users.company_id`), one hop from the events. That needs a "group" role that can be an implicitly joined column, which is the roles-as-expressions work, plus a decision about people who belong to several companies, or change company.
- **Company properties are two hops away** (`events → users → companies`). Lib only offers implicit joins one hop from a query's tables (`implicitly-joinable-columns`), but an explicit join to the people table makes its foreign keys implicitly joinable, so two hops work through one explicit join.

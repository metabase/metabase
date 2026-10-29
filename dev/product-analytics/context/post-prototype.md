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

**UX.** Users shouldn't edit the expression. They'd see an ordered list of rules: pattern, replacement, and a preview against sample paths. The list compiles to the expression, with good defaults for the generic rules.

**Where it lives.** It's per table, not per analysis, so it belongs with the column roles in table metadata ([event-table-settings.plan.md](event-table-settings.plan.md)). Meanwhile, a model with a cleaned-path custom column works today with no new UX, once the table picker accepts models.

## Recognizing pageviews in other schemas

`events/pageviews.ts` only recognizes Umami and Track (`event_type = 1`). Elsewhere a pageview is an event name, so detecting it means finding a known value in the event name column:

| Source | Pageview | Page |
|---|---|---|
| GA4 export | `event_name = 'page_view'` | `page_location` in `event_params` |
| Snowplow | `event_name = 'page_view'` | `page_urlpath` |
| PostHog export | `event = '$pageview'` | `properties.$pathname` |
| Plausible | `name = 'pageview'` | `pathname` |
| Amplitude export | `event_type = '[Amplitude] Page Viewed'` | a property |
| Mixpanel export | `event = '$mp_web_page_view'` | `$current_url` |
| Segment, RudderStack | a separate `pages` table | `path` |

- **Event name values:** checking them needs the column's field values, which aren't in the table metadata the settings see today.
- **Segment:** the separate `pages` table needs a union with `tracks` before any of this applies.
- **Whole schemas:** this belongs with fingerprinting whole schemas in [analysis-settings.plan.md](analysis-settings.plan.md), which assigns every role at once.

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

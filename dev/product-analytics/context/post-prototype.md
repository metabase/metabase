# Product analytics: after the prototype

Work we've decided is needed, but not for the prototype. Each section stands on its own.

## Path cleaning

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

**Where it lives.** It's per table, not per analysis, so it belongs with the column roles in table metadata. Meanwhile, a model with a cleaned-path custom column works today with no new UX, once the table picker accepts models.

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

## Funnel timing that scales

The funnel counts people with ClickHouse's `windowFunnel`, which makes one pass over each person's events. Anything that measures time, though (the "How long it took" view, the median time between steps in the tooltip, the period in "Over time", and the funnel's Paths), needs to know *which* run through the steps was counted. `windowFunnel` only returns how far someone got.

### What the prototype does

`funnel_chains` in `sql/analyses/funnel.ts` tries a run from every one of a person's first-step events, using `arrayFold`, and keeps the run that gets furthest. Its work and memory both grow with (first-step events × step events) per person, so it's quadratic for a person whose first step is something frequent, like a pageview. Measured on the dev ClickHouse:

| | `windowFunnel` | `funnel_chains` |
|---|---|---|
| Sample data, 1.68M events, 23k people | ~13 ms | ~1.4 s |
| One person, 10k first-step events | ~3 ms | ~2.7 s |
| One person, 30k first-step events | ~3 ms | out of memory (~12 GiB) |

A single bot or heavy user can take the whole query down.

The shortcut it replaced, which was timing from each step's first-ever event (`minIf(ts, step_k)`), is fast but wrong. A run that went nowhere, such as an early visit, stretches the times past the funnel's window. `dev/product-analytics/check.ts` has fixture checks for this.

### Proposal: next-step lookups with window functions

Most of each run's work is the same across starts, because a run takes the first next-step event after the current one. Precompute that per event:

1. For every event and every step k, the time of the first step-k event after it: `MIN(CASE WHEN step_k THEN ts END) OVER (PARTITION BY actor ORDER BY ts ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING)`.
2. A run from a first-step event at `s` is then n − 1 lookups: `c_2` is the event's next step 2, `c_3` is the next step 3 after the event at `c_2`, and so on. Each lookup is an equi-join on (actor, ts).
3. Keep the runs within the window, and pick one per person.

That costs about (events × steps) with a sort per person, and it keeps today's choice of run. "Counted from each step", which goes on from a step's latest repeat, needs a "latest step-k event before" lookup as well, built the same way.

### Other databases

`windowFunnel` and `arrayFold` are ClickHouse-only:

| Warehouse | Funnel building blocks |
|---|---|
| ClickHouse | `windowFunnel`, `sequenceMatch`, `arrayFold` |
| Snowflake, Oracle, Trino/Athena | `MATCH_RECOGNIZE` matches the steps and returns their rows and times. Snowflake also has `REDUCE`. |
| Databricks, DuckDB | Array folds (`aggregate`, `list_reduce`) |
| BigQuery, Postgres, Redshift, MySQL | Window functions and joins only |

Window functions and equi-joins exist everywhere, so the proposal above is also the portable one: it works for counting how far people got, not just for timing. It fits MBQL better than per-warehouse funnel functions, though MBQL would still need window-function support to express it.

### More generally

Other prototype analyses lean on ClickHouse in the same ways: per-person `groupArray` (paths), `ARRAY JOIN` row multiplication (funnel steps, time buckets), and a `countIf` per flag (insights). Before choosing each analysis's MBQL shape, benchmark it against a heavy-tailed dataset, meaning a few people with very many events, not only typical volumes.

## Draft segments

Drafts are segments made in the segments panel and not saved to the table yet. The prototype keeps them in `sessionStorage` (`segments/use-segment-drafts.ts`), so they survive a reload in the same tab and nowhere else: a new tab, another browser or a teammate doesn't see them.

So that a saved analysis still works elsewhere, an analysis that uses a draft copies its conditions: event slots, people filters and cohort breakouts all do. The copy is on its own from then on:

- **Edits don't carry through.** Changing the draft, or saving it as a segment, doesn't change the analyses that copied it. A saved segment is kept by id instead, so edits to it do.
- **Nothing ties the copy to its draft.** Only the label is kept, so an analysis can't offer to switch to the segment once the draft is saved.

After the prototype, drafts need a home on the server, per person, whether that's a draft state on the segment model or something of their own. An analysis could then keep a draft by id like a saved segment, and follow it when it's saved.

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

## Funnel querying

How the funnel finds each person's run through the steps, what we measured, and the open questions for production are in [funnel-querying.md](funnel-querying.md#after-the-prototype). The open questions are join or no join per engine, database-specific fast paths, and heavy tails.

## Heavy-tailed data

Prototype analyses lean on ClickHouse in ways that may not hold up when a few people have very many events:

- per-person `groupArray` (paths);
- `ARRAY JOIN` row multiplication (funnel steps, time buckets);
- a `countIf` per flag (insights).

Before choosing each analysis's MBQL shape, benchmark it against a heavy-tailed dataset, not only typical volumes.

## Draft segments

Drafts are segments made in the segments panel and not saved to the table yet. The prototype keeps them in `sessionStorage` (`segments/use-segment-drafts.ts`), so they survive a reload in the same tab and nowhere else: a new tab, another browser or a teammate doesn't see them.

So that a saved analysis still works elsewhere, an analysis that uses a draft copies its conditions: event slots, people filters and cohort breakouts all do. The copy is on its own from then on:

- **Edits don't carry through.** Changing the draft, or saving it as a segment, doesn't change the analyses that copied it. A saved segment is kept by id instead, so edits to it do.
- **Nothing ties the copy to its draft.** Only the label is kept, so an analysis can't offer to switch to the segment once the draft is saved.

After the prototype, drafts need a home on the server, per person, whether that's a draft state on the segment model or something of their own. An analysis could then keep a draft by id like a saved segment, and follow it when it's saved.

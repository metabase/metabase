# Product analytics prototype: context

## Goal

Build a hi-fi frontend prototype of in-app product analytics, using real Metabase frontend code, within about two weeks. The backend can be faked. It's a demo of what we want to ship, not production code. Code should be clean and extensible, but doesn't need to be production ready. Tests are optional - write them if they'll help validate something tricky, otherwise skip them.

## Where the vision comes from

- A lo-fi demo by the CEO: `~/event-analytics-ui-no-css-script.html` (CSS and JS stripped). Source: `metabase/event-analytics-ui`. It was AI-generated, so treat it as a starting point, not a spec.
- Core ideas:
  - A table marked as an "event table" unlocks a product analytics builder.
  - A "kind of event" (e.g. "User signed up") is a filter over event rows.
  - Global controls: date range, granularity, timezone, and "counting" (which actor to count: person, session, ...).
  - Five analyses: Funnel, Paths, Habit (called "stickiness" elsewhere), Lifecycle, Cohorts (called "retention" elsewhere).
  - Drill-through: every chart cell is a set of events or actors, so any analysis can run on it.
- The demo also proposes MBQL extensions, Projects A–H: multi-stage queries, ordered sequences, window functions, per-query timezone, map access, regex, OR filters, behavioral ORs. These are out of scope for the prototype.

## Data pipeline (Metabase Track)

- `metabase/metabase-track`: the `@metabase/track` and `@metabase/track-react` browser clients, in alpha. A light fork of Umami's tracker. Posts `{type: "event"|"identify", payload}` to `https://product-analytics-ingestion.metabase.com/api/send`.
- `metabase/pa-lambdas`: ingestion. API Gateway, then SQS, then a processor Lambda (Python) writes Parquet to S3, then a loader writes to ClickHouse. Canonical DDL is in `sql/`.
- `metabase/harbormaster` (`product_analytics.clj`): sells this as a Cloud add-on (`product-analytics`, `product-analytics-free`) and creates the tables in the customer's Metabase Cloud Storage ClickHouse database. `website_id` = the hosted-instance id, so each database holds one website.
- Metabase dogfoods it as "metaplow" (`frontend/src/metabase/utils/metaplow.ts`, `src/metabase/analytics/metaplow.clj`):
  - Website `23eefa30-…`, tag `metabase-instance`.
  - `distinct_id` is the instance's `analytics-uuid`, and the person is `event_data['user_id']`.
  - Pageviews are custom events named `"pageview"`.

## Tables

- `pa_events`: one wide row per event.
  - `event_type`: 1 = pageview, 2 = custom.
  - `event_name`: empty for pageviews.
  - URL and referrer parts, UTM tags, ad click ids.
  - Browser, OS and device; country, region and city.
  - `distinct_id`, `visitor_id`, `session_id`, `visit_id`.
  - `created_at DateTime`.
  - `event_data Map(String, String)` for custom properties.
- `pa_sessions`: a per-session snapshot derived by the loader.
- `pa_identities`: traits from `identify()` calls.
- Known bugs (full list in [`product-analytics.md`](product-analytics.md), "Technical feedback"):
  - `created_at` is batch processing time, not event time.
  - `session_id` is a daily IP + user agent hash when anonymous, and the user id once identified.
  - `visit_id` is an hourly IP + user agent hash.
  - `pa_sessions` counts and times are wrong.
  - Missing values are `''`, not NULL.
  - `event_data` values are Python `str()` output.

## Identity

- Track records raw ids and nothing else:
  - `visitor_id` is an anonymous cookie id, opt-in via `persistence: true`.
  - `distinct_id` is the `identify()` id, held only for the current page load.
- Nothing links anonymous activity to a user: no alias or merge, and no groups/accounts. Stitching would have to happen in the warehouse: person = `coalesce(distinct_id, identity_map[visitor_id], visitor_id)`.
- Other tools: PostHog, Amplitude and Mixpanel merge identities at ingest. Segment and Snowplow leave it to the warehouse (dbt).

## Existing Metabase pieces

- Tables have an "Event" entity type (`:entity/EventTable`), auto-inferred from names containing "event", "log" or "checkin".
- A column has exactly one semantic type, and FK is a semantic type, so event-table column roles probably need their own mapping.
- Segments are the closest existing concept to saved event definitions.
- Driver: `modules/drivers/clickhouse`.
- Visualizations that already exist: Funnel, Sankey, Pivot, Line/Bar.
- `POST /api/dataset/native` compiles MBQL to SQL with parameters inlined.

## Competitor reference

- **PostHog** is closest. Its insight types match the five analyses. Saved insights are typed JSON "query nodes", compiled through HogQL to ClickHouse SQL. Its "data warehouse" insights map arbitrary tables to `id_field` / `distinct_id_field` / `timestamp_field`.
- **Mitzu** is warehouse-native: an analysis spec is compiled deterministically to SQL, and its agent writes specs, not SQL.
- **Amplitude** and **Mixpanel** use proprietary engines that store events sorted per user. Amplitude's warehouse-native product is legacy and not sold to new customers.
- **Vocabulary pitfalls:**
  - Elsewhere, "cohort" means a saved set of people, often defined by behavior ("did X at least twice"), not a retention grid.
  - Saved event definitions are called "actions" in PostHog and "custom events" in Amplitude and Mixpanel.

## Files

- [`product-analytics.md`](product-analytics.md): open questions and technical feedback.

Any created plans should also live in this folder.

The planned starting point for product analytics is an 'event table':

- Where is this defined? Using existing Data Studio/Table Metadata UI and semantic types?
- What's required to be considered an 'event table'?
  - Who: User semantic type? or Name? both?
    - A column can only have one semantic type, so an FK column can't have its semantic type changed to User without breaking linked table behavior. So we might need our own mapping for event types
    - Or stop storing FKs as a semantic type, which is something we've considered in the past - see the docstring of `src/metabase/types/core.cljc`
  - What: maybe we need a new Event semantic type?
  - When: a new Event timestamp semantic type? CreationTimestamp?
  - Tables also have an Event entity type. This can only be set in Data Studio, not Table Metadata
- Note for later: we should make sure that industry standard schemas are automatically recognized as 'event tables'

There's a concept of reusable, saved event definitions:

- Where are these defined? Conceptually they're similar to segments, but I'm not sure if reusing the segments UX makes sense. These probably need their own name and place to be defined.
- Event definitions can also be in the form of "did X at least twice". This is a `HAVING` filter on an aggregate, not a `WHERE` filter like a segment. Might not be in scope for v1, but more reason for event definitions to at least eventually have their own place to be defined.
  - Or maybe the "did X at least twice" case is separate from an event definition. Other tools in the industry call this a "Cohort", which collides with our analysis type named "Cohorts"

Does this deserve its own item in the "New" menu?

- We could explore a way for the 5 event analysis options (Funnel, Paths, Habit, Lifecycle, Cohorts) to pop in as options in the query builder after you select an 'event table'
- These shouldn't take over the whole screen, because you should still be able to use the query builder as you would normally after selecting an 'event table'

These questions may be out of scope for a v1 frontend design exercise:

- My understanding is product analytics works on an 'event table' whether it's ingested into ClickHouse with Metabase Track or ingested into the customer's database using their existing tracking scripts
  - If the pricing model is based on ClickHouse ingestion and/or storage, are we giving product analytics away for free? Why would I change my tracking script to use Metabase Track if I don't need to?
  - Are we concerned about performance of complex product analytics queries on OLTP databases leading to the perception that "Metabase product analytics is slow"?
  - Do we allow customers to move their existing event history into ClickHouse? One time, or ongoing sync? Do we need UX for this?

Technical feedback: bugs in metabase-track (client, `0cd3b5b`) and metabase/pa-lambdas (ingestion into the `pa_*` ClickHouse tables, `324faa0`):

- Timestamps
  - `created_at` is the processing time of the Lambda batch, not when the event happened. It's computed once per batch (`received_at` in `processor/handler.py`), so every event in a batch gets the same second, and a queue backlog shifts all of them
  - The client never sends an event timestamp, and the processor wouldn't read one. Stock Umami accepts `payload.timestamp`
  - Result: the order of one person's events is unreliable, which matters for ordered funnels and paths
- Sessions and visits
  - `session_id` means two different things. Anonymous: a hash of IP + user agent + website + UTC date. Identified: the `identify()` id itself, because Harbormaster provisions `session_mode: client`. It isn't a session in either case
  - `visit_id` is a hash of IP + user agent + website + UTC hour. Visits split on every hour boundary, and different people with the same IP + user agent (NAT, shared machines) share a visit. Stock Umami continues a visit through the `x-umami-cache` token and expires it after 30 minutes idle. pa-lambdas never reads `x-track-cache`, so the client's cache handling is dead code
  - `pa_sessions` is rewritten from each loader batch: `first_seen` = `last_seen` = that batch's time and `visits` is always 1. `ReplacingMergeTree(last_seen)` keeps the latest row, so `first_seen` ends up meaning "last seen"
  - `pa_sessions` is `ORDER BY session_id` without `website_id`, so same-id sessions from two websites in one database would merge. Latent today because each database has one website
- Identity
  - `pa_identities` replaces the whole trait map on every `identify()`. The README pattern `identify(user.id)` with no traits writes `{}` and wipes previously sent traits once ClickHouse merges
  - The processor drops `visitor_id` from identify payloads, so the anonymous-to-known link is never stored where you'd look for it
  - `identify()` isn't persisted client-side, and `init()` sends a pageview immediately. The first pageview of every page load is anonymous, even for logged-in users
  - The `_mb_vid` cookie domain is the last two hostname labels. On multi-part TLDs (`app.example.co.uk` gives `co.uk`) the browser rejects the cookie, so `visitor_id` changes on every page load
- Data encoding
  - Missing values are stored as `''` in `Nullable(String)` columns (`distinct_id`, `visitor_id`, `event_name`, UTMs, ...). Nothing is ever NULL, so "is empty" works and "is null" doesn't
  - `event_data` values are Python `str()` output: booleans become `"True"`/`"False"`, and nested objects and arrays become Python repr (`"{'a': 1}"`), which isn't JSON
  - The limits documented on `EventData` (numeric precision 4, 500-character strings, 50 properties, 50-character event names) are copied from Umami and enforced nowhere
- Coverage and deduplication
  - Only `pushState`/`replaceState` are hooked, so browser back/forward in a single-page app produces no pageview (no `popstate` handler)
  - `event_id` is generated server-side at processing time. If SQS redelivers a message (standard queues are at-least-once), the duplicate row gets a different `event_id` and can't be deduplicated

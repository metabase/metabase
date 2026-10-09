# Product analytics prototype data

Fake SaaS event data in the `pa_events` schema, plus a resolved table Metabase
queries. This is demo data, not production ingestion.

Design notes, open questions, and the query-layer plan live in [`context/`](context/).

## Start ClickHouse

Driver tests already bind `127.0.0.1:8123`, so this uses **18123**:

```bash
docker run -d --name ch \
  -e CLICKHOUSE_SKIP_USER_SETUP=1 \
  -p 127.0.0.1:18123:8123 \
  clickhouse/clickhouse-server:26.8-alpine
```

No volume and no `ulimit` — Docker Desktop / OrbStack is fine at defaults.
Recreate the container to reset. `CLICKHOUSE_SKIP_USER_SETUP=1` is what the
ClickHouse driver compose file uses so `default` can log in with an empty
password.

## Load data

From the repo root:

```bash
# schema, ~25k people / 120 days / ~2–3M events, then pa_events_resolved
bun run dev/product-analytics/generate.ts
```

Smaller run: `PA_PEOPLE=2000 bun run dev/product-analytics/generate.ts`

Data ends at today's UTC midnight, and the prototype queries are relative to
now, so re-run the generator before a demo.

HTTP endpoint override: `CLICKHOUSE_URL=http://127.0.0.1:18123`.

## Connect in Metabase

Admin → Databases → Add database:

| Field    | Value              |
|----------|--------------------|
| Engine   | ClickHouse         |
| Name     | Product Analytics  |
| Host     | localhost          |
| Port     | 18123              |
| Database | product_analytics  |
| Username | default            |
| Password | *(empty)*          |

Turn **Enable multiple databases** off so only `product_analytics` syncs.

Then: `mb db sync-schema <id> --wait`

Optionally mark the table as events:

```bash
mb table update <table-id> --body '{"entity_type":"entity/EventTable"}'
```

Open `/product-analytics/debug` on the running app (webpack on 8080) to
compile and run the five analyses.

`bun dev-ee` does **not** include the `:drivers` alias, so ClickHouse comes
from `plugins/clickhouse.metabase-driver.jar`. Leave that JAR in place.

The stock plugin (older partner build) still destructures MBQL 4. If Lib
`case(...)` fails with **Unexpected ->honeysql call on a map**, rebuild the
in-tree driver into `plugins/` and restart:

```bash
clojure -X:build:drivers:build/driver :driver :clickhouse
```

## Check the planners

```bash
bun run dev/product-analytics/check.ts
```

Runs each analysis's SQL against ClickHouse (hand-written `events_base` CTE,
no Metabase) and compares counts to `ground-truth.json`.

## What the generator deliberately does *not* copy from Track

Columns are filled with the meanings they **should** have:

- `created_at` is the event time, not batch processing time
- `visitor_id` on every event; ~15% of people use two devices
- `distinct_id` from signup onward, NULL before (not `''`)
- `session_id` / `visit_id` are real 30-minute-inactivity sessions
- `event_data` values are plain strings, not Python `str()`

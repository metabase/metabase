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

On the running app (webpack on 8080), New → Event analysis opens the start
page. Each analysis's SQL is under the SQL button.

`bun dev-ee` does **not** include the `:drivers` alias, so ClickHouse comes
from `plugins/clickhouse.metabase-driver.jar`. Leave that JAR in place.

The stock plugin (older partner build) still destructures MBQL 4. If Lib
`case(...)` fails with **Unexpected ->honeysql call on a map**, rebuild the
in-tree driver into `plugins/` and restart:

```bash
clojure -X:build:drivers:build/driver :driver :clickhouse
```

## Add event segments

Segments on `pa_events_resolved` show up under "Browse actions" when defining
an event. This creates a starter set matching the seeded data, looking up the
table and field ids by name. Re-running it skips segments that already exist.

```bash
DB_ID=$(mb db list --json | jq '.data[] | select(.name == "Product Analytics") | .id')
TABLE_ID=$(mb table list --db-id "$DB_ID" --json | jq '.data[] | select(.name == "pa_events_resolved") | .id')
FIELDS=$(mb table get "$TABLE_ID" --include fields --json)
EVENT_NAME=$(jq '.fields[] | select(.name == "event_name") | .id' <<<"$FIELDS")
URL_PATH=$(jq '.fields[] | select(.name == "url_path") | .id' <<<"$FIELDS")

# event_name is any of the arguments
event_name_in() {
  jq -nc --argjson f "$EVENT_NAME" '["=", {}, ["field", {}, $f]] + $ARGS.positional' --args "$@"
}

# Creates a segment from a name and one filter clause, skipping existing names
segment() {
  if mb segment list --json | jq -e --arg n "$1" --argjson t "$TABLE_ID" \
      'any(.data[]; .name == $n and .table_id == $t)' >/dev/null; then
    echo "exists: $1"; return
  fi
  jq -n --arg name "$1" --argjson filter "$2" --argjson db "$DB_ID" --argjson table "$TABLE_ID" '{
    name: $name,
    table_id: $table,
    definition: {
      "lib/type": "mbql/query",
      database: $db,
      stages: [{"lib/type": "mbql.stage/mbql", "source-table": $table, filters: [$filter]}]
    }
  }' | mb segment create --json | jq -c '{id, name}'
}

segment "Viewed pricing"   "[\"=\", {}, [\"field\", {}, $URL_PATH], \"/pricing\"]"
segment "Started trial"    "$(event_name_in trial_started)"
segment "Purchased"        "$(event_name_in checkout_completed)"
segment "Signed up"        "$(event_name_in signup)"
segment "Was active"       "[\"or\", {}, [\"starts-with\", {}, [\"field\", {}, $URL_PATH], \"/app\"], $(event_name_in report_created invite_sent checkout_completed)]"
segment "Sent an invite"   "$(event_name_in invite_sent)"
segment "Hit an error"     "$(event_name_in error)"
segment "Created a report" "$(event_name_in report_created)"
```

To start over, archive them with `mb segment archive <id>` (ids from
`mb segment list`).

## Check the planners

```bash
bun run dev/product-analytics/check.ts
```

Runs each analysis's SQL against ClickHouse (hand-written `events_base` CTE,
no Metabase) and compares counts to `ground-truth.json`.

```bash
bun run dev/product-analytics/check-insights.ts
```

Runs the funnel insight search the same way and checks it finds the effects
`generate.ts` planted (`insights` in `ground-truth.json`). After regenerating,
re-sync the database in Metabase so new columns like `trial_source` get
fingerprints, since insights only consider fingerprinted columns.

## What the generator deliberately does *not* copy from Track

Columns are filled with the meanings they **should** have:

- `created_at` is the event time, not batch processing time
- `visitor_id` on every event; ~15% of people use two devices
- `distinct_id` from signup onward, NULL before (not `''`)
- `session_id` / `visit_id` are real 30-minute-inactivity sessions
- `event_data` values are plain strings, not Python `str()`

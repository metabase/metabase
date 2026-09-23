// Creates or updates the "Metabot papercuts" dashboard in the local Metabase, then runs every card.
// Run it with `make dashboard` so Bun loads MB_URL and MB_API_KEY from .env.
const base = process.env.MB_URL ?? "http://localhost:3000";
const key = process.env.MB_API_KEY;
if (!key) throw new Error("MB_API_KEY is not set: put it in .env and run make dashboard");

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "x-api-key": key!, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const verdictColors = { series_settings: { papercut: { color: "#ED6E6E" }, clean: { color: "#84BB4C" } } };
const resultColors = { series_settings: { error: { color: "#ED6E6E" }, success: { color: "#84BB4C" } } };

// pos: [row, col, width, height] on the 24-column dashboard grid
const cards: { name: string; display: string; pos: number[]; sql: string; viz?: object }[] = [
  {
    name: "Tool calls",
    display: "scalar",
    pos: [0, 0, 6, 3],
    sql: `select count(*) as calls
from pa_events
where event_name = 'ai_service_event.agent_used_tool'`,
  },
  {
    name: "Tool errors",
    display: "scalar",
    pos: [0, 6, 6, 3],
    sql: `select count(*) as errors
from pa_events
where event_name = 'ai_service_event.agent_used_tool'
  and event_data->>'result' = 'error'`,
  },
  {
    name: "Papercuts found",
    display: "scalar",
    pos: [0, 12, 6, 3],
    sql: `select count(*) as papercuts
from pa_events
where event_name = 'ai_service_event.agent_turn_reviewed'
  and event_data->>'result' = 'papercut'`,
  },
  {
    name: "Issues written",
    display: "scalar",
    pos: [0, 18, 6, 3],
    sql: `select count(*) as issues
from triage_groups
where issue_markdown is not null`,
  },
  {
    name: "Reviewed turns per minute, papercut vs clean",
    display: "line",
    pos: [3, 0, 12, 6],
    sql: `with turns as (
  select date_trunc('minute', created_at at time zone 'America/Toronto') as minute,
         event_data->>'result' as result
  from pa_events
  where event_name = 'ai_service_event.agent_turn_reviewed'
)
select m.minute,
       count(t.result) filter (where t.result = 'papercut') as papercut,
       count(t.result) filter (where t.result = 'clean') as clean
from generate_series((select min(minute) from turns),
                     date_trunc('minute', now() at time zone 'America/Toronto'),
                     interval '1 minute') as m(minute)
left join turns t on t.minute = m.minute
group by 1
order by 1`,
    viz: { "graph.dimensions": ["minute"], "graph.metrics": ["papercut", "clean"], ...verdictColors },
  },
  {
    name: "Metabot tool calls by tool and result",
    display: "bar",
    pos: [3, 12, 12, 6],
    sql: `select coalesce(event_data->'event_details'->>'tool_name', '(unknown)') as tool,
       event_data->>'result' as result,
       count(*) as calls
from pa_events
where event_name = 'ai_service_event.agent_used_tool'
group by 1, 2
order by 1, 2`,
    viz: {
      "graph.dimensions": ["tool", "result"],
      "graph.metrics": ["calls"],
      "stackable.stack_type": "stacked",
      ...resultColors,
    },
  },
  {
    name: "Latest findings",
    display: "table",
    pos: [9, 0, 24, 6],
    sql: `select to_char(created_at at time zone 'America/Toronto', 'Mon DD HH24:MI:SS') as "Time",
       replace(event_name, 'ai_service_event.', '') as "Event",
       coalesce(event_data->'event_details'->>'tool_name', event_data->'event_details'->>'tool') as "Tool",
       event_data->'event_details'->>'error_class' as "Error class",
       event_data->'event_details'->>'signals' as "Signals",
       event_data->'event_details'->>'category' as "Category",
       event_data->>'session_id' as "Conversation"
from pa_events
where (event_name = 'ai_service_event.agent_used_tool' and event_data->>'result' = 'error')
   or (event_name = 'ai_service_event.agent_turn_reviewed' and event_data->>'result' = 'papercut')
order by created_at desc
limit 50`,
  },
  {
    name: "Triage queue",
    display: "table",
    pos: [15, 0, 24, 5],
    sql: `select coalesce(verdict->>'title', concat_ws(' / ', tool, error_class, category)) as "Title",
       status as "Status",
       event_count as "Events",
       verdict->>'severity' as "Severity",
       issue_ref as "Issue",
       to_char(last_seen at time zone 'America/Toronto', 'Mon DD HH24:MI:SS') as "Last seen"
from triage_groups
order by last_seen desc
limit 50`,
  },
  {
    name: "Tool errors by tool and error class",
    display: "bar",
    pos: [20, 0, 8, 6],
    sql: `select coalesce(event_data->'event_details'->>'tool_name', '(unknown)') as tool,
       coalesce(event_data->'event_details'->>'error_class', '(unknown)') as error_class,
       count(*) as errors
from pa_events
where event_name = 'ai_service_event.agent_used_tool'
  and event_data->>'result' = 'error'
group by 1, 2
order by 3 desc`,
    viz: { "graph.dimensions": ["tool", "error_class"], "graph.metrics": ["errors"], "stackable.stack_type": "stacked" },
  },
  {
    name: "Papercuts by category",
    display: "row",
    pos: [20, 8, 8, 6],
    sql: `select coalesce(event_data->'event_details'->>'category', '(none)') as category,
       count(*) as papercuts
from pa_events
where event_name = 'ai_service_event.agent_turn_reviewed'
  and event_data->>'result' = 'papercut'
group by 1
order by 2 desc`,
    viz: { "graph.dimensions": ["category"], "graph.metrics": ["papercuts"] },
  },
  {
    name: "Turn review signals by verdict",
    display: "row",
    pos: [20, 16, 8, 6],
    sql: `select trim(signal) as signal,
       event_data->>'result' as result,
       count(*) as turns
from pa_events,
     regexp_split_to_table(event_data->'event_details'->>'signals', ',') as signal
where event_name = 'ai_service_event.agent_turn_reviewed'
  and trim(signal) <> ''
group by 1, 2
order by 3 desc`,
    viz: {
      "graph.dimensions": ["signal", "result"],
      "graph.metrics": ["turns"],
      "stackable.stack_type": "stacked",
      ...verdictColors,
    },
  },
];

const dbs = await api("GET", "/api/database");
let db = (dbs.data ?? dbs).find((d: any) => d.name === "Papercuts");
if (!db) {
  db = await api("POST", "/api/database", {
    name: "Papercuts",
    engine: "postgres",
    details: { host: "localhost", port: 5433, dbname: "papercuts", user: "papercuts", password: "papercuts", ssl: false },
  });
  console.log(`added database Papercuts (${db.id})`);
}
for (let i = 0; db.initial_sync_status !== "complete"; i++) {
  if (i === 60) throw new Error(`database ${db.id} still syncing after 60s`);
  await Bun.sleep(1000);
  db = await api("GET", `/api/database/${db.id}`);
}

const collections = await api("GET", "/api/collection");
const collection =
  collections.find((c: any) => c.name === "Papercut tracker" && !c.archived && !c.personal_owner_id) ??
  (await api("POST", "/api/collection", { name: "Papercut tracker" }));

const items = async (model: string) =>
  new Map<string, number>(
    (await api("GET", `/api/collection/${collection.id}/items?models=${model}`)).data.map((i: any) => [i.name, i.id]),
  );

const existingCards = await items("card");
const cardIds: number[] = [];
for (const c of cards) {
  const body = {
    name: c.name,
    type: "question",
    display: c.display,
    collection_id: collection.id,
    dataset_query: { database: db.id, type: "native", native: { query: c.sql, "template-tags": {} } },
    visualization_settings: c.viz ?? {},
  };
  const id = existingCards.get(c.name);
  cardIds.push(id ? (await api("PUT", `/api/card/${id}`, body)).id : (await api("POST", "/api/card", body)).id);
}

const name = "Metabot papercuts";
const dashboardId =
  (await items("dashboard")).get(name) ?? (await api("POST", "/api/dashboard", { name, collection_id: collection.id })).id;
await api("PUT", `/api/dashboard/${dashboardId}`, {
  width: "full",
  dashcards: cards.map((c, i) => {
    const [row, col, size_x, size_y] = c.pos;
    return { id: -(i + 1), card_id: cardIds[i], row, col, size_x, size_y, parameter_mappings: [], visualization_settings: {} };
  }),
});

let failed = 0;
for (const [i, c] of cards.entries()) {
  const r = await api("POST", `/api/card/${cardIds[i]}/query`);
  if (r.status === "completed") console.log(`ok    ${c.name}: ${r.row_count} rows`);
  else {
    failed++;
    console.log(`FAIL  ${c.name}: ${r.error}`);
  }
}
console.log(`\n${base}/dashboard/${dashboardId}#refresh=10`);
process.exit(failed ? 1 : 0);

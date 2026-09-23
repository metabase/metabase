/**
 * Build (or rebuild) the Search Harness data app in a local Metabase through the REST API.
 *
 * Idempotent: the harness DB connection is added if missing; cards are matched by name inside the
 * "Search Harness" collection and updated in place; the dashboard's tabs and dashcards are replaced
 * wholesale. The serdes export in ../dashboard/ is the durable copy; this is how it is produced.
 *
 *   npm run dashboard            # Metabase URL and login: see ./mb.ts
 *
 * Filters and card SQL live in ./dashboard-cards.ts.
 */
import { type CardItem, FILTERS, type TagName, TABS } from "./dashboard-cards.ts";
import { isMain } from "./is-main.ts";
import { type Mb, MB_URL, login } from "./mb.ts";
import { DEFAULT_URL } from "./writer.ts";

export const DB_NAME = "Search Harness";
export const COLLECTION_NAME = "Search Harness";
const DASHBOARD_NAME = "Search engine comparison";

type Named = { id: number; name: string };

/** Stable template-tag ids keep dashboard parameter mappings valid across rebuilds. */
const TAG_IDS: Record<TagName, string> = {
  corpus: "8f7c0a5e-1b2a-4c55-9d1e-000000000001",
  scale: "8f7c0a5e-1b2a-4c55-9d1e-000000000002",
  embedder: "8f7c0a5e-1b2a-4c55-9d1e-000000000003",
  scenario: "8f7c0a5e-1b2a-4c55-9d1e-000000000004",
  variant: "8f7c0a5e-1b2a-4c55-9d1e-000000000005",
  strategy: "8f7c0a5e-1b2a-4c55-9d1e-000000000006",
};

/**
 * Only required tags carry a card-level default (Metabase requires one). An optional tag must not: when the
 * dashboard filter is cleared, Metabase falls back to the card default, so a cleared Scale would silently
 * mean "Scale = 100" and hide runs with no scale tier. Optional defaults live on the dashboard parameter.
 */
function templateTag(t: TagName) {
  const f = FILTERS[t];
  return {
    id: TAG_IDS[t], name: t, "display-name": f.label, type: f.type, required: f.required ?? false,
    ...(f.required && { default: String(f.default) }),
  };
}

const field = (name: string, type: "text" | "number") =>
  ["field", name, { "base-type": type === "number" ? "type/Integer" : "type/Text" }];

/** Register the harness Postgres DB as a Metabase warehouse, unless it already is. */
async function ensureMetabaseDatabase(mb: Mb): Promise<number> {
  const { data } = await mb.json<{ data: Named[] }>("GET", "/api/database");
  const hit = data.find((d) => d.name === DB_NAME);
  if (hit) {
    return hit.id;
  }
  // Metabase runs on the host, so the container's published port is reachable as localhost.
  const u = new URL(process.env.HARNESS_DB_URL ?? DEFAULT_URL);
  const db = await mb.json<Named>("POST", "/api/database", {
    engine: "postgres",
    name: DB_NAME,
    details: { host: u.hostname, port: Number(u.port), dbname: u.pathname.slice(1), user: u.username, password: u.password, ssl: false },
  });
  console.log(`added database "${DB_NAME}" (id ${db.id})`);
  return db.id;
}

async function ensureCollection(mb: Mb): Promise<number> {
  const colls = await mb.json<(Named & { archived: boolean })[]>("GET", "/api/collection");
  return colls.find((c) => c.name === COLLECTION_NAME && !c.archived)?.id
    ?? (await mb.json<Named>("POST", "/api/collection", {
      name: COLLECTION_NAME,
      description: "Search engine comparison harness — hackathon/harness/.",
    })).id;
}

type CardSpec = Pick<CardItem, "name" | "description" | "display" | "settings" | "tags" | "sql">;

async function upsertCard(mb: Mb, spec: CardSpec, dbId: number, collectionId: number, existing: Named[]): Promise<number> {
  const body = {
    name: spec.name,
    description: spec.description ?? null,
    display: spec.display,
    collection_id: collectionId,
    visualization_settings: spec.settings ?? {},
    dataset_query: {
      database: dbId,
      type: "native",
      native: { query: spec.sql.trim(), "template-tags": Object.fromEntries(spec.tags.map((t) => [t, templateTag(t)])) },
    },
  };
  const hit = existing.find((c) => c.name === spec.name);
  if (hit) {
    return (await mb.json<Named>("PUT", `/api/card/${hit.id}`, body)).id;
  }
  // Remember the new card, so a card placed on two tabs is created once and reused.
  const created = await mb.json<Named>("POST", "/api/card", body);
  existing.push(created);
  return created.id;
}

export async function buildDashboard(): Promise<string> {
  const mb = await login();
  const dbId = await ensureMetabaseDatabase(mb);
  const collId = await ensureCollection(mb);
  const existing = (await mb.json<{ data: Named[] }>("GET", `/api/collection/${collId}/items?models=card`)).data;

  const parameters = [];
  for (const [key, f] of Object.entries(FILTERS) as [TagName, (typeof FILTERS)[TagName]][]) {
    const cardId = await upsertCard(mb, { name: f.values.name, display: "table", tags: [], sql: f.values.sql }, dbId, collId, existing);
    parameters.push({
      id: key,
      name: f.label,
      slug: f.slug,
      type: f.type === "number" ? "number/=" : "string/=",
      ...(f.default !== undefined && { default: [f.default] }),
      required: f.required ?? false,
      values_query_type: "list",
      values_source_type: "card",
      values_source_config: {
        card_id: cardId,
        value_field: field(f.values.value, f.type),
        ...(f.values.label && { label_field: field(f.values.label, "text") }),
      },
    });
  }

  const dashes = (await mb.json<{ data: Named[] }>("GET", `/api/collection/${collId}/items?models=dashboard`)).data;
  const dashId = dashes.find((d) => d.name === DASHBOARD_NAME)?.id
    ?? (await mb.json<Named>("POST", "/api/dashboard", {
      name: DASHBOARD_NAME,
      collection_id: collId,
      description: "Evaluating Metabase search, using Metabase.",
    })).id;

  const tabs = [];
  const dashcards = [];
  let nextId = -1;
  for (const [tabIndex, { name, items }] of TABS.entries()) {
    const tabId = -(tabIndex + 1);
    tabs.push({ id: tabId, name });
    let row = 0;
    let col = 0;
    let rowHeight = 0;
    for (const item of items) {
      const [w, h] = item.size;
      if (col + w > 24) {
        row += rowHeight;
        col = 0;
        rowHeight = 0;
      }
      const cardId = item.kind === "card" ? await upsertCard(mb, item, dbId, collId, existing) : null;
      dashcards.push({
        id: nextId--, card_id: cardId, dashboard_tab_id: tabId, row, col, size_x: w, size_y: h,
        parameter_mappings: item.kind === "card"
          ? item.tags.map((t) => ({ parameter_id: t, card_id: cardId, target: ["variable", ["template-tag", t]] }))
          : [],
        visualization_settings: item.kind === "text"
          ? {
              virtual_card: { name: null, display: "text", visualization_settings: {}, dataset_query: {}, archived: false },
              text: item.text.trim(),
            }
          : {},
      });
      col += w;
      rowHeight = Math.max(rowHeight, h);
    }
  }

  await mb.json("PUT", `/api/dashboard/${dashId}`, { parameters, tabs, dashcards });
  return `${MB_URL}/dashboard/${dashId}`;
}

if (isMain(import.meta.url)) {
  console.log(await buildDashboard());
}

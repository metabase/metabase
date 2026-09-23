/**
 * Smoke-check the data app: run every dashcard of the harness dashboard through the API with the dashboard's
 * default filters (optionally overridden) and report row counts. Exits non-zero if any card errors.
 *
 *   npm run check
 *   npm run check -- '{"corpus":["northwind-golden-v1"],"scale":null}'   # override; null = leave empty
 */
import { COLLECTION_NAME } from "./dashboard.ts";
import { isMain } from "./is-main.ts";
import { MB_URL, login } from "./mb.ts";

type Param = { id: string; type: string; default?: unknown };
type Dashcard = {
  id: number;
  card_id: number | null;
  dashboard_tab_id: number;
  card: { name: string; display: string };
  parameter_mappings: { parameter_id: string; target: unknown }[];
};

export async function checkDashboard(overrides: Record<string, unknown> = {}): Promise<boolean> {
  const mb = await login();
  const colls = await mb.json<{ id: number; name: string; archived: boolean }[]>("GET", "/api/collection");
  const coll = colls.find((c) => c.name === COLLECTION_NAME && !c.archived);
  if (!coll) throw new Error(`no collection "${COLLECTION_NAME}" at ${MB_URL}`);
  const [dashItem] = (await mb.json<{ data: { id: number }[] }>("GET", `/api/collection/${coll.id}/items?models=dashboard`)).data;
  if (!dashItem) throw new Error(`no dashboard in "${COLLECTION_NAME}"`);
  const dash = await mb.json<{ id: number; tabs: { id: number; name: string }[]; parameters: Param[]; dashcards: Dashcard[] }>(
    "GET", `/api/dashboard/${dashItem.id}`);
  const tabs = new Map(dash.tabs.map((t) => [t.id, t.name]));
  let errors = 0;
  let empty = 0;
  for (const dc of dash.dashcards.filter((d) => d.card_id !== null)) {
    const parameters = dc.parameter_mappings.flatMap((m) => {
      const p = dash.parameters.find((x) => x.id === m.parameter_id)!;
      const value = p.id in overrides ? overrides[p.id] : p.default;
      return value == null ? [] : [{ id: p.id, type: p.type, value, target: m.target }];
    });
    const r = await mb.json<{ row_count?: number; error?: string; status?: string }>(
      "POST", `/api/dashboard/${dash.id}/dashcard/${dc.id}/card/${dc.card_id}/query`, { parameters });
    const error = r.error ?? (r.status && r.status !== "completed" ? r.status : undefined);
    errors += error ? 1 : 0;
    empty += !error && !r.row_count ? 1 : 0;
    console.log(`${String(tabs.get(dc.dashboard_tab_id)).padEnd(18)} ${dc.card.name.padEnd(52)} rows=${r.row_count ?? "-"}${error ? `  ERROR ${error.slice(0, 200)}` : ""}`);
  }
  console.log(`${MB_URL}/dashboard/${dash.id}: ${errors} error(s), ${empty} empty card(s)`);
  return errors === 0;
}

if (isMain(import.meta.url)) {
  process.exit((await checkDashboard(JSON.parse(process.argv[2] ?? "{}"))) ? 0 : 1);
}

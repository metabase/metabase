import { SQL } from "bun";

const sql = new SQL("postgres://papercuts:papercuts@localhost:5433/papercuts");

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (v == null ? null : String(v));
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

async function send(req: Request) {
  const text = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {}
  const p = isObj(body) ? body.payload : undefined;
  if (!isObj(p) || typeof p.name !== "string" || !p.name || (p.data != null && !isObj(p.data))) {
    console.log(`${now()} 400 malformed: ${text.slice(0, 200)}`);
    return Response.json({ error: "malformed payload" }, { status: 400 });
  }
  const data: Obj = p.data ?? {};
  try {
    const [row] = await sql`
      insert into pa_events (website_id, hostname, tag, distinct_id, event_name, event_data, raw)
      values (${str(p.website)}, ${str(p.hostname)}, ${str(p.tag)}, ${str(p.id)}, ${p.name},
              ${data}, ${body})
      returning id`;
    const d = isObj(data.event_details) ? data.event_details : {};
    const detail = [data.result, d.tool_name ?? d.tool, d.error_class, d.category, d.signals].filter(Boolean).join(" ");
    console.log(`${now()} #${row.id} ${p.name} ${detail}`);
    return Response.json({ ok: true, id: Number(row.id) });
  } catch (e: any) {
    // Postgres class 22 is bad data (e.g. \u0000 in a string): retrying won't help, so 400 stops Metabase retrying.
    const status = String(e?.errno ?? e?.code ?? "").startsWith("22") ? 400 : 500;
    console.log(`${now()} ${status} insert failed for ${p.name}: ${e?.message ?? e}`);
    return Response.json({ error: "insert failed" }, { status });
  }
}

const server = Bun.serve({
  port: 8765,
  routes: {
    "/health": new Response("ok"),
    "/api/send": { POST: send },
  },
  fetch: () => new Response("not found", { status: 404 }),
});
console.log(`${now()} receiver listening on ${server.url}api/send`);

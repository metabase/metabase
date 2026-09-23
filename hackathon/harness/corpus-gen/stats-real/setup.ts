// Prepares the booted stats-real instance for the runner and writes a runner manifest (local only).
//   - a non-admin harness user in its own group (fairness rule 4)
//   - that group: read on every shared (non-personal) collection, view-data + query-builder on every database
//
//   node setup.ts --url http://localhost:3041 --admin-email stats-real-admin@example.com \
//     --admin-password-file ../../../../local/stats-real/.admin-password [--out ../../../../local/stats-real/manifest.runner.json]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, parseArgs, writeJson } from "../lib.ts";

const args = parseArgs(process.argv.slice(2));
const base = (args.url ?? "http://localhost:3041").replace(/\/$/, "");
const out = args.out ?? join(import.meta.dirname, "../../../../local/stats-real/manifest.runner.json");
const adminPassword = readFileSync(args["admin-password-file"] ?? join(import.meta.dirname, "../../../../local/stats-real/.admin-password"), "utf8").trim();

let session = "";
async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(session ? { "X-Metabase-Session": session } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

session = (await api<{ id: string }>("POST", "/api/session", { username: args["admin-email"] ?? "stats-real-admin@example.com", password: adminPassword })).id;
const me = await api("GET", "/api/user/current");
if (!me.is_superuser) fail("admin login is not a superuser");

const groups = await api<any[]>("GET", "/api/permissions/group");
const allUsers = groups.find((g) => g.magic_group_type === "all-internal-users") ?? fail("no All Users group");
const groupName = "Harness stats-real-v1";
const group = groups.find((g) => g.name === groupName) ?? await api("POST", "/api/permissions/group", { name: groupName });

const email = "harness+stats-real-v1@example.com";
const password = "harness-Readonly-2026";
const users = await api<{ data: any[] }>("GET", `/api/user?query=${encodeURIComponent(email)}`);
const user = users.data.find((u) => u.email === email) ?? await api("POST", "/api/user", {
  first_name: "Harness", last_name: "Reader", email, password,
  user_group_memberships: [{ id: allUsers.id }, { id: group.id }],
});
if (user.is_superuser) fail("harness user must not be a superuser");

// Collections: read on every shared collection (personal ones are ignored by the graph API anyway).
const collections = (await api<any[]>("GET", "/api/collection?archived=false"))
  .filter((c) => typeof c.id === "number" && !c.personal_owner_id && !c.is_personal);
const CHUNK = 100;
for (let i = 0; i < collections.length; i += CHUNK) {
  const patch = Object.fromEntries(collections.slice(i, i + CHUNK).map((c) => [String(c.id), "read"]));
  await api("PUT", "/api/collection/graph?force=true&skip-graph=true", { groups: { [group.id]: { root: "read", ...patch } } });
}

// Data: see and query every database (tables, segments and measures are only searchable with data access).
// Database ids come from the permissions graph: on this snapshot GET /api/database returns malformed JSON
// mid-stream (one database's details fail to serialise).
const { revision, groups: permGroups } = await api("GET", "/api/permissions/graph");
const dbs = [...new Set(Object.values(permGroups as Record<string, Record<string, unknown>>).flatMap((g) => Object.keys(g)))]
  .map((id) => ({ id: Number(id) }));
await api("PUT", "/api/permissions/graph?force=true&skip-graph=true", {
  revision,
  groups: { [group.id]: Object.fromEntries(dbs.map((d) => [String(d.id), { "view-data": "unrestricted", "create-queries": "query-builder" }])) },
});

writeJson(out, {
  corpusId: "stats-real-v1",
  metabaseUrl: base,
  harnessUser: { email, password, id: user.id, groupId: group.id },
  snapshot: "2026-09-17-pg-custom-ab992524190a-e0ac6cbddc4d",
});
console.log(`harness user ${user.id} in group ${group.id}: read on ${collections.length} collections, data on ${dbs.length} databases -> ${out}`);

/**
 * Serdes round-trip for the Search Harness collection, via the running instance's REST API (EE
 * serialization; the local instance's license covers it).
 *
 *   npm run serdes -- export   # collection → ../dashboard/serdes/ (YAML, committed)
 *   npm run serdes -- import   # ../dashboard/serdes/ → Metabase (needs the "Search Harness" DB to exist)
 *
 * The export deliberately omits settings and the data model: cards are native SQL and reference the
 * database by name, so importing into another instance only needs a DB called "Search Harness".
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { COLLECTION_NAME, DB_NAME } from "./dashboard.ts";
import { isMain } from "./is-main.ts";
import { login } from "./mb.ts";

const SERDES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "serdes");
const DIRNAME = "search-harness";

/** Run `fn` with a fresh temp directory, removed afterwards. */
function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "harness-serdes-"));
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

export async function exportCollection(): Promise<string> {
  const mb = await login();
  const colls = await mb.json<{ id: number; name: string; archived: boolean }[]>("GET", "/api/collection");
  const coll = colls.find((c) => c.name === COLLECTION_NAME && !c.archived);
  if (!coll) throw new Error(`no collection "${COLLECTION_NAME}"; run npm run dashboard first`);
  const qs = new URLSearchParams({ collection: String(coll.id), settings: "false", data_model: "false", dirname: DIRNAME });
  // The tarball is already gzip; without identity the server gzips it again and fetch yields an empty body.
  const res = await mb.request("POST", `/api/ee/serialization/export?${qs}`, { headers: { "Accept-Encoding": "identity" } });
  const tarball = Buffer.from(await res.arrayBuffer());
  await withTempDir(async (tmp) => {
    writeFileSync(join(tmp, "export.tar.gz"), tarball);
    execFileSync("tar", ["-xzf", join(tmp, "export.tar.gz"), "-C", tmp]);
    // Entity ids are stable across exports, so replacing the directory yields a clean diff.
    rmSync(SERDES_DIR, { recursive: true, force: true });
    // The API always adds instance-global entities (python libraries, transform tags/jobs); keep only ours.
    cpSync(join(tmp, DIRNAME, "collections"), join(SERDES_DIR, "collections"), { recursive: true });
  });
  return SERDES_DIR;
}

export async function importCollection(): Promise<string> {
  const mb = await login();
  const dbs = await mb.json<{ data: { name: string }[] }>("GET", "/api/database");
  if (!dbs.data.some((d) => d.name === DB_NAME)) {
    throw new Error(`no database "${DB_NAME}" — add it first (npm run dashboard does this)`);
  }
  if (readdirSync(SERDES_DIR).length === 0) throw new Error(`${SERDES_DIR} is empty`);
  const tarball = await withTempDir(async (tmp) => {
    const path = join(tmp, "import.tar.gz");
    execFileSync("tar", ["-czf", path, "-C", join(SERDES_DIR, ".."), "-s", `,^serdes,${DIRNAME},`, "serdes"]);
    return readFileSync(path);
  });
  const form = new FormData();
  form.append("file", new Blob([tarball], { type: "application/gzip" }), "import.tar.gz");
  return (await mb.request("POST", "/api/ee/serialization/import", { body: form })).text();
}

if (isMain(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === "export") {
    console.log(`exported to ${await exportCollection()}`);
  } else if (cmd === "import") {
    const log = await importCollection();
    console.log(log.split("\n").filter((l) => /ERROR|WARN|Imported|Import/.test(l)).slice(-20).join("\n") || "imported");
  } else {
    console.error("usage: npm run serdes -- export|import");
    process.exit(1);
  }
}

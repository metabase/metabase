/**
 * Create the `harness` database if missing, then apply ../sql/*.sql in order. Idempotent.
 *
 *   npm run schema
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { isMain } from "./is-main.ts";
import { DEFAULT_URL, close, getPool } from "./writer.ts";

const SQL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql");

/** Create the harness Postgres database itself if it does not exist yet. */
async function ensurePgDatabase(): Promise<void> {
  const url = new URL(process.env.HARNESS_DB_URL ?? DEFAULT_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`created database ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}

async function applySchema(): Promise<string[]> {
  const files = readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await getPool().query(readFileSync(join(SQL_DIR, f), "utf8"));
  }
  return files;
}

if (isMain(import.meta.url)) {
  await ensurePgDatabase();
  console.log(`applied ${(await applySchema()).join(", ")}`);
  await close();
}

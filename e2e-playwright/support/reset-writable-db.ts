/**
 * Port of `resetWritableDb` (e2e/support/db_tasks.js:41).
 *
 * Cypress's `H.restore(name)` calls this automatically whenever the snapshot
 * name contains "-writable" (e2e-setup-helpers.js:44-49), BEFORE hitting
 * /api/testing/restore. Ours did not, and the task was never ported — so
 * warehouse state accumulated across every run on a long-lived container while
 * the app DB was reset each time (FINDINGS #157).
 *
 * The cost was not hypothetical: ~30 debris schemas, `403 A table with that
 * name already exists` on 9 tests in one CI run, plus 8 flaky in transforms
 * alone, and one spec (datamodel-data-studio-search) that asserts exact counts
 * could not pass at all.
 *
 * 🔴 This is destructive by design — it DROPs every non-`public` schema in the
 * writable postgres and every table in the writable database on mysql. That is
 * exactly what upstream does, and it is safe because the snapshot restore that
 * follows rebuilds whatever the spec needs.
 *
 * Upstream can be this destructive because a Cypress job is single-worker. We
 * run `--workers=2` against a SHARED container, so the blast radius had to be
 * narrowed instead: with `PW_PER_WORKER_BACKEND` set, every name below resolves
 * through `writableDbName()` to this worker's OWN `writable_db_w<slot>`, so the
 * drops can only ever reach tables this worker created. See
 * support/writable-db.ts for the full rationale.
 */
import {
  type WritebackDialect,
  writableDbClient,
  writableDbName,
} from "./writable-db";

export type { WritebackDialect };

type RawClient = {
  raw(sql: string): Promise<unknown>;
  destroy(): Promise<void>;
};

/** Mirrors upstream's `dontDrop` regex. `public` is kept and emptied instead —
 * dropping it would take the schema itself, which the restore does not
 * recreate. */
const KEEP_SCHEMA = /^pg_|information_schema|public/;

async function resetPostgres(client: RawClient) {
  const { rows: schemas } = (await client.raw(
    "SELECT nspname as name FROM pg_namespace;",
  )) as { rows: { name: string }[] };

  for (const schema of schemas ?? []) {
    if (!KEEP_SCHEMA.test(schema.name)) {
      await client.raw(`DROP SCHEMA "${schema.name}" CASCADE;`);
    }
  }

  const { rows: tables } = (await client.raw(
    "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'",
  )) as { rows: { name: string }[] };

  for (const table of tables ?? []) {
    // CASCADE, unlike upstream's bare DROP TABLE: ports create views and FKs
    // that upstream's fixtures do not, and a dependency error here would abort
    // the reset half-done — worse than not resetting at all.
    await client.raw(`DROP TABLE IF EXISTS public."${table.name}" CASCADE;`);
  }
}

async function resetMysql(client: RawClient) {
  const [tables] = (await client.raw(
    `SELECT table_name as name FROM information_schema.tables WHERE table_schema = '${writableDbName()}';`,
  )) as [{ name: string }[], unknown];

  if (!tables?.length) {
    return;
  }
  // FK order is not guaranteed by information_schema, so suspend the checks
  // rather than trying to topologically sort the drops.
  await client.raw("SET FOREIGN_KEY_CHECKS = 0;");
  try {
    for (const table of tables) {
      await client.raw(`DROP TABLE IF EXISTS \`${table.name}\`;`);
    }
  } finally {
    await client.raw("SET FOREIGN_KEY_CHECKS = 1;");
  }
}

/**
 * Drops all non-`public` schemas and all `public` tables (postgres), or every
 * table in this worker's writable database (mysql). Call BEFORE the snapshot
 * restore, matching upstream's ordering.
 */
export async function resetWritableDb({
  type = "postgres",
}: { type?: WritebackDialect } = {}) {
  const client = writableDbClient(type);
  try {
    if (type === "postgres") {
      await resetPostgres(client);
    } else {
      await resetMysql(client);
    }
  } finally {
    await client.destroy();
  }
}

/** Upstream's dialect rule from e2e-setup-helpers.js:46 — the snapshot name
 * decides, and anything not named "postgres" is mysql. */
export function writableDialectFor(snapshot: string): WritebackDialect {
  return snapshot.includes("postgres") ? "postgres" : "mysql";
}

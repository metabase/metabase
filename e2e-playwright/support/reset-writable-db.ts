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
 * writable postgres and every table in `writable_db` on mysql. That is exactly
 * what upstream does, and it is safe because the snapshot restore that follows
 * rebuilds whatever the spec needs. It is NOT safe to run while another agent
 * or worker is using the same container: the containers are shared across
 * slots even though the app DBs are not (FINDINGS #178).
 */
export type WritebackDialect = "mysql" | "postgres";

type RawClient = {
  raw(sql: string): Promise<unknown>;
  destroy(): Promise<void>;
};

// Duplicated from e2e/support/cypress_data.js (WRITABLE_DB_CONFIG) rather than
// imported from support/actions-on-dashboards.ts: that is a per-spec module,
// and shared infrastructure must not depend on one. Postgres connects as
// `metabase`; mysql needs `root` (only root can create databases).
const WRITABLE_DB_CONFIG: Record<
  WritebackDialect,
  { client: string; connection: Record<string, unknown> }
> = {
  postgres: {
    client: "pg",
    connection: {
      host: "localhost",
      user: "metabase",
      password: "metasample123",
      database: "writable_db",
      port: 5404,
      ssl: false,
    },
  },
  mysql: {
    client: "mysql2",
    connection: {
      host: "localhost",
      user: "root",
      password: "metasample123",
      database: "writable_db",
      port: 3304,
      multipleStatements: true,
    },
  },
};

function knexClient(dialect: WritebackDialect): RawClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => RawClient;
  return Knex(WRITABLE_DB_CONFIG[dialect]);
}

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
    "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'writable_db';",
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
 * table in `writable_db` (mysql). Call BEFORE the snapshot restore, matching
 * upstream's ordering.
 */
export async function resetWritableDb({
  type = "postgres",
}: { type?: WritebackDialect } = {}) {
  const client = knexClient(type);
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

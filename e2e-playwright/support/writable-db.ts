/**
 * Per-worker writable warehouse databases.
 *
 * THE PROBLEM. `resetWritableDb()` (support/reset-writable-db.ts) is a faithful
 * port of upstream's task: it DROPs every non-`public` schema and every
 * `public` table in the writable postgres, and every table in `writable_db` on
 * mysql. Upstream is safe doing that because a Cypress CI job is single-worker
 * — one spec at a time per container. We are not: CI runs `--workers=2` per
 * shard with per-worker *backends* but a SINGLE shared postgres/mysql container
 * (`e2e-prepare-containers` runs once per shard job). So worker 0's
 * `restore("mysql-writable")` drops tables worker 1 created seconds earlier,
 * mid-spec.
 *
 * Measured, not theoretical: classifying a 66-failure CI run against two
 * `workers=1` control runs, 45 of the 66 passed cleanly at `workers=1` and
 * `flaky` collapsed from 44 to 6. Characteristic symptoms are
 * `Table 'writable_db.scoreboard_actions' doesn't exist` and
 * `403 A table with that name already exists`.
 *
 * THE FIX. Give each worker its OWN database inside the SAME container:
 * `writable_db_w<slot>`. Then `resetWritableDb` keeps upstream's exact
 * semantics (drop everything) while only ever dropping things this worker owns,
 * and the race is structurally impossible rather than merely unlikely.
 *
 * This is the same shape as the existing per-worker treatment of **database 1**
 * (support/fixtures.ts `sampleDbUrl`): snapshots pin database 1 to a shared H2
 * file only one JVM can hold, so every restore re-points it at a private copy.
 * Here, snapshots pin **database 2** to the shared `writable_db`, so every
 * `-writable` restore re-points it at this worker's private database.
 *
 * WHY AN EMPTY DATABASE IS THE CORRECT COPY (verified, not assumed). The task
 * brief warned `writable_db` might carry seed content that a `TEMPLATE` copy
 * would be needed to preserve. It does not:
 *   - `setupWritableDB` (e2e/support/helpers/e2e-qa-databases-helpers.js:208)
 *     issues a bare `CREATE DATABASE writable_db;` — no seeding.
 *   - `convertToWritable` (e2e/snapshot-creators/qa-db.cy.snap.js) only
 *     re-points the existing QA database's `dbname` at it and enables actions.
 *   - `resetWritableDb` deletes everything in it before every `-writable`
 *     restore, so "empty" is precisely the state upstream guarantees a spec.
 *   - MEASURED on the live containers: postgres `writable_db` held 0 tables and
 *     0 non-system schemas; mysql `writable_db` held one debris table
 *     (`many_data_types`) left by an earlier run, i.e. not a seed either.
 * Fixtures like the `Domestic`/`Wild` schemas that `data-model-shared-*`
 * depends on are built by the specs' own helpers (support/data-model.ts,
 * support/data-model-shared-3.ts), not by the container image. So a freshly
 * created empty database is an exact substitute, and no TEMPLATE copy (which
 * postgres would refuse while any connection to the template is open, and
 * which mysql has no equivalent for at all) is needed.
 *
 * GATING. Per-worker databases are used only when `PW_PER_WORKER_BACKEND` is
 * set — the same switch that partitions backends. With it off, every helper
 * resolves the plain shared `writable_db` and behaviour is byte-for-byte
 * unchanged. `PW_SLOT_OFFSET` is honoured identically to the backend slots, so
 * concurrent INVOCATIONS get distinct databases too.
 *
 * ALWAYS resolve the name through `writableDbName()` — never hardcode
 * `"writable_db"` in a helper again. A helper still pointing at the shared
 * database is exactly the silent-wrong-database failure this change exists to
 * eliminate.
 */

export type WritebackDialect = "mysql" | "postgres";

/** Connection facts, mirroring WRITABLE_DB_CONFIG in e2e/support/cypress_data.js. */
export const QA_POSTGRES_PORT = 5404;
export const QA_MYSQL_PORT = 3304;
const QA_HOST = "localhost";
const QA_PASSWORD = "metasample123";
/** Postgres connects as `metabase`; mysql needs `root` (only root can CREATE DATABASE). */
const QA_USER: Record<WritebackDialect, string> = {
  postgres: "metabase",
  mysql: "root",
};
/** A database that is guaranteed to exist, used to bootstrap `CREATE DATABASE`. */
const BOOTSTRAP_DB = "sample";

const BASE_NAME = "writable_db";

/**
 * This process's slot, or `null` when per-worker isolation is off.
 *
 * Playwright sets `TEST_PARALLEL_INDEX` in each worker process before it loads
 * any test file (`playwright/lib/worker/workerProcessEntry.js`), so this is
 * readable from module scope in a support file. parallelIndex, not workerIndex:
 * a replacement worker lands on the same slot and must inherit the same
 * database, exactly as it inherits the same backend.
 */
export function writableDbSlot(): number | null {
  if (!process.env.PW_PER_WORKER_BACKEND) {
    return null;
  }
  return (
    Number(process.env.TEST_PARALLEL_INDEX || 0) +
    Number(process.env.PW_SLOT_OFFSET || 0)
  );
}

/** The writable database THIS worker owns. `writable_db` when isolation is off. */
export function writableDbName(): string {
  const slot = writableDbSlot();
  return slot === null ? BASE_NAME : `${BASE_NAME}_w${slot}`;
}

/**
 * Bare connection object for this worker's writable database — what `new
 * pg.Client(...)` / `new mysql.Connection(...)` take directly.
 *
 * A FUNCTION, not a constant, on purpose: `TEST_PARALLEL_INDEX` only exists
 * inside a Playwright worker process, so anything resolved at module scope in
 * the runner process would silently bake in slot 0. Call it at connect time.
 */
export function writableDbConnection(dialect: WritebackDialect) {
  return dialect === "postgres"
    ? {
        host: QA_HOST,
        user: QA_USER.postgres,
        password: QA_PASSWORD,
        database: writableDbName(),
        port: QA_POSTGRES_PORT,
        ssl: false,
      }
    : {
        host: QA_HOST,
        user: QA_USER.mysql,
        password: QA_PASSWORD,
        database: writableDbName(),
        port: QA_MYSQL_PORT,
        multipleStatements: true,
      };
}

/**
 * Knex config for this worker's writable database. Every helper that talks to
 * the warehouse directly should build its client from this rather than
 * repeating the connection literal.
 */
export function writableDbConfig(dialect: WritebackDialect) {
  return {
    client: dialect === "postgres" ? "pg" : "mysql2",
    connection: writableDbConnection(dialect),
  };
}

/**
 * The `details` patch that re-points Metabase's database 2 at this worker's
 * writable database.
 *
 * `dbname` is the key for BOTH engines — see `convertToWritable`
 * (e2e/snapshot-creators/qa-db.cy.snap.js), which sets
 * `details: { dbname: "writable_db", ...(mysql ? { user: "root" } : {}) }`.
 * That is where the snapshots' pinning comes from, so it is exactly what has to
 * be overridden.
 *
 * The password is re-supplied rather than round-tripped: `GET /api/database/:id`
 * redacts secrets to `**MetabasePass**` (secrets/models/secret.clj
 * `protected-password`), and echoing that placeholder back is a needless
 * dependency on the backend's substitution behaviour.
 */
export function writableDbDetailsPatch(
  existingDetails: Record<string, unknown> | undefined,
  dialect: WritebackDialect,
) {
  return {
    ...(existingDetails ?? {}),
    dbname: writableDbName(),
    user: QA_USER[dialect],
    password: QA_PASSWORD,
  };
}

type RawClient = {
  raw(sql: string): Promise<unknown>;
  destroy(): Promise<void>;
};

function knex(config: unknown): RawClient {
  // Lazy require: `knex`/`pg`/`mysql2` are not dependencies of this package,
  // they resolve from the repo-root node_modules at runtime.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => RawClient;
  return Knex(config);
}

/** A client for this worker's writable database. */
export function writableDbClient(dialect: WritebackDialect): RawClient {
  return knex(writableDbConfig(dialect));
}

function bootstrapClient(dialect: WritebackDialect): RawClient {
  const config = writableDbConfig(dialect) as {
    client: string;
    connection: Record<string, unknown>;
  };
  return knex({
    ...config,
    connection: { ...config.connection, database: BOOTSTRAP_DB },
  });
}

/**
 * Create this worker's writable database if it does not exist.
 *
 * Idempotent and safe to call from several workers at once — the postgres path
 * tolerates the `42P04 duplicate_database` it can lose a check-then-create race
 * to, and mysql uses `IF NOT EXISTS`. Called once per worker at fixture setup,
 * NOT per test: `CREATE DATABASE` is the one warehouse operation that is
 * genuinely expensive.
 *
 * Deliberately never drops. Reuse across runs is fine — `resetWritableDb`
 * empties the database before every `-writable` restore anyway, and dropping in
 * teardown would race a concurrent invocation sharing the slot.
 */
export async function provisionWritableDb(dialect: WritebackDialect) {
  const name = writableDbName();
  if (name === BASE_NAME) {
    return name; // isolation off: the shared database already exists
  }
  const client = bootstrapClient(dialect);
  try {
    if (dialect === "postgres") {
      const { rows } = (await client.raw(
        `SELECT 1 FROM pg_database WHERE datname = '${name}';`,
      )) as { rows: unknown[] };
      if (!rows?.length) {
        await client.raw(`CREATE DATABASE "${name}";`).catch((error: Error) => {
          // Lost the check-then-create race with a sibling worker; the
          // database exists either way, which is all we asked for.
          if (!/already exists/i.test(String(error))) {
            throw error;
          }
        });
      }
    } else {
      await client.raw(`CREATE DATABASE IF NOT EXISTS \`${name}\`;`);
    }
  } finally {
    await client.destroy();
  }
  return name;
}

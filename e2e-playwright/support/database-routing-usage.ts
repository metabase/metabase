/**
 * Helpers for the database-routing-usage spec (port of
 * e2e/test/scenarios/admin/database-routing/database-routing-usage.cy.spec.ts
 * plus the subset of its e2e-database-routing-helpers.ts that the spec uses).
 *
 * Everything here talks to the QA postgres container on QA_POSTGRES_PORT
 * (5404) — the spec CREATEs three real postgres databases (`lead`,
 * `destination_one`, `destination_two`), each holding an identically-shaped
 * `db_identifier` table, and then routes Metabase queries between them. So the
 * whole spec is infra-gated on PW_QA_DB_ENABLED (PORTING infra-gate rule).
 *
 * Reused read-only from sibling modules (parallel-agent rule 9 — no shared
 * module is edited):
 * - `configureDbRoutingViaAPI`, `createDestinationDatabasesViaAPI`,
 *   `BASE_POSTGRES_DESTINATION_DB_INFO`, `QA_POSTGRES_PORT`, `ALL_USERS_GROUP`
 *                                        → support/database-routing-admin.ts
 * - `updatePermissionsGraph` (the 3-arg form that keeps `impersonations`)
 *                                        → support/model-actions.ts
 * - `sandboxTable`, `COLLECTION_GROUP`   → support/dashboard-repros.ts
 * - `blockUserGroupPermissions`          → support/table-collection-permissions.ts
 * - `createUserFromRawData`              → support/sandboxing-via-api.ts
 *   (NOT its `signInWithCredentials` — see the spec's `signInAs` for why)
 * - `createNativeQuestion`               → support/factories.ts
 * - `visitQuestion`                      → support/ui.ts
 *
 * New here: the knex-backed `createDbWithIdentifierTable` (Cypress runs it
 * through cy.task("connectAndQueryDB"), which the Playwright harness has no
 * equivalent for) and a `dbName`-parameterised `addPostgresDatabase` (the
 * existing ports in documents-core.ts / embedding-hub.ts hard-code the
 * `sample` database, whereas this spec needs one connection per new database).
 * `knex`/`pg` are not dependencies of this package; they resolve from the
 * repo-root node_modules, which is why the require is lazy — the module must
 * still load when the gate is off and the drivers may be absent.
 *
 * === PER-SLOT PHYSICAL DATABASES (see `routingDbName`) ===
 *
 * The three databases this module CREATEs live at the postgres SERVER level, so
 * they sit OUTSIDE the per-worker `writable_db_w<slot>` isolation that
 * support/writable-db.ts established for the warehouse. Two concurrent runs (two
 * slots, or two invocations at different `PW_SLOT_OFFSET`s) against the one
 * shared `metabase-e2e-postgres-sample-1` container therefore collide on the
 * same `lead` / `destination_one` / `destination_two`, and the collision is
 * destructive rather than merely redundant: `createDbWithIdentifierTable` does
 * `DROP TABLE IF EXISTS db_identifier; CREATE TABLE …` , so one run can drop the
 * table the other's Metabase sync is reading. `routingDbName` suffixes the
 * PHYSICAL name per slot, exactly as `writableDbName()` does.
 *
 * The LOGICAL names stay untouched, because they are load-bearing in three
 * places and only one of them is the postgres database:
 *   - the `db_identifier` ROW values, which the spec asserts on
 *     (`expectColumnContains(page, "name", "destination_one")`);
 *   - the Metabase database `name` of each destination, which IS the routing
 *     slug matched against the `destination_database` login attribute in
 *     `DB_ROUTER_USERS` (and quoted in `NO_DESTINATION_ERROR`);
 *   - the Metabase display names.
 * All three are per-backend, and backends are already per-slot, so none of them
 * needs a suffix. Only `details.dbname` and the `CREATE DATABASE` do.
 *
 * The `blue_role` role is deliberately NOT suffixed. Roles are cluster-level in
 * postgres, so it genuinely is shared — but every grant made to it
 * (`GRANT SELECT ON db_identifier`, `CREATE POLICY blue_policy`) is issued while
 * connected to this slot's OWN database and so is scoped to that database's
 * table. Sharing the role is therefore safe; the only shared mutation is its
 * creation, and the check-then-create race there is handled by catching
 * `duplicate_object` (see `createDbWithIdentifierTable`). Suffixing it would
 * also mean rewriting the `db_role` login attribute in `DB_ROUTER_USERS`, i.e.
 * changing spec data for no isolation gain.
 */
import type { MetabaseApi } from "./api";
import {
  ALL_USERS_GROUP,
  QA_POSTGRES_PORT,
} from "./database-routing-admin";
import { COLLECTION_GROUP } from "./dashboard-repros";
import { expect } from "./fixtures";
import { writableDbName, writableDbSlot } from "./writable-db";

/** Mirrors QA_DB_CREDENTIALS (e2e/support/cypress_data.js). */
export const QA_DB_CREDENTIALS = {
  host: "localhost",
  user: "metabase",
  password: "metasample123",
  database: "sample",
};

// === port of DB_ROUTER_USERS (e2e-database-routing-helpers.ts) ===

export const DB_ROUTER_USERS = {
  userA: {
    first_name: "Don",
    last_name: "RouterA",
    email: "routerA@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "destination_one",
      color: "blue",
      db_role: "blue_role",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
  userB: {
    first_name: "Tom",
    last_name: "RouterB",
    email: "routerB@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "destination_two",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
  userWithMetabaseRouterAttr: {
    first_name: "Router",
    last_name: "Attribute",
    email: "routerAttribute@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "__METABASE_ROUTER__",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
  userNoAttribute: {
    first_name: "Jane",
    last_name: "NoAttribute",
    email: "noattribute@metabase.test",
    password: "12341234",
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
  userWrongAttribute: {
    first_name: "Bill",
    last_name: "WrongAttribute",
    email: "wrongattribute@metabase.test",
    password: "12341234",
    login_attributes: {
      destination_database: "wrong_destination",
    },
    user_group_memberships: [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ],
  },
};

// === knex plumbing (port of the cy.task("connectAndQueryDB") calls) ===

type KnexClient = {
  raw(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  destroy(): Promise<void>;
};

function pgClient(database: string): KnexClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  return Knex({
    client: "pg",
    connection: {
      host: QA_DB_CREDENTIALS.host,
      user: QA_DB_CREDENTIALS.user,
      password: QA_DB_CREDENTIALS.password,
      database,
      port: QA_POSTGRES_PORT,
      ssl: false,
    },
  });
}

async function queryPg(
  database: string,
  query: string,
): Promise<{ rows: Record<string, unknown>[] }> {
  const client = pgClient(database);
  try {
    return await client.raw(query);
  } finally {
    await client.destroy();
  }
}

/**
 * Port of H.queryWritableDB(sql) — the writable postgres is the connection the
 * upstream helper uses to CREATE the per-test databases. The shared
 * `queryWritableDB` (support/actions-on-dashboards.ts) is equivalent, but this
 * module already owns a pg client factory, so it reuses it rather than
 * importing a second knex config.
 */
export function queryWritableDB(query: string) {
  return queryPg(writableDbName(), query);
}

/**
 * The PHYSICAL postgres database backing a LOGICAL routing database name.
 *
 * `lead` when isolation is off — byte-for-byte the upstream name — and
 * `lead_w<slot>` when `PW_PER_WORKER_BACKEND` is set. The slot comes from
 * `writableDbSlot()` so the gate, the `PW_SLOT_OFFSET` handling and the
 * parallelIndex-not-workerIndex choice are the SAME ones the warehouse
 * database uses, rather than a second copy that can drift from it.
 *
 * A FUNCTION, not a constant, for the reason spelled out in writable-db.ts:
 * `TEST_PARALLEL_INDEX` only exists inside a Playwright worker process, so
 * anything resolved at module scope in the runner would bake in slot 0.
 *
 * Every call site that names a physical database — the `CREATE DATABASE`, the
 * per-database connections, and `details.dbname` on the Metabase side — must go
 * through this. Anything still saying `"lead"` where postgres will read it is
 * the silent-shared-database failure this exists to remove.
 */
export function routingDbName(logicalName: string): string {
  const slot = writableDbSlot();
  return slot === null ? logicalName : `${logicalName}_w${slot}`;
}

/**
 * Port of createDbWithIdentifierTable (e2e-database-routing-helpers.ts).
 *
 * Creates the database if it doesn't exist, then (re)creates `db_identifier`
 * with two rows both named after the database — one blue, one red — plus the
 * `blue_role` role and the row-level-security policy the impersonation test
 * relies on. Statement-for-statement faithful to upstream apart from two
 * things: knex-direct instead of cy.task, and the physical database name being
 * resolved through `routingDbName` (see the module header).
 *
 * `dbName` is the LOGICAL name. The `db_identifier` rows keep it verbatim — the
 * spec asserts on those values, so they must not carry the slot suffix.
 */
export async function createDbWithIdentifierTable({
  dbName,
}: {
  dbName: string;
}) {
  const physical = routingDbName(dbName);
  if (physical !== dbName) {
    // Proof, in the run log, that concurrent workers really are on different
    // databases. Cheap and only emitted when isolation is on.
    console.log(
      `[routing-db slot ${writableDbSlot()}] ${dbName} -> ${physical}`,
    );
  }

  const existing = await queryWritableDB(
    `SELECT datname from pg_database WHERE datname = '${physical}'`,
  );
  if (existing.rows.length === 0) {
    try {
      await queryWritableDB(`CREATE DATABASE ${physical};`);
    } catch (error) {
      // Lost the check-then-create race with a concurrent worker/invocation
      // that shares this postgres container. The database exists either way,
      // which is all we asked for. Same tolerance as provisionWritableDb.
      if (!/already exists/i.test(String(error))) {
        throw error;
      }
    }
  }

  await queryPg(
    physical,
    "DROP TABLE IF EXISTS db_identifier; CREATE TABLE db_identifier (name VARCHAR(50), color VARCHAR(20));",
  );

  await queryPg(
    physical,
    `INSERT INTO db_identifier VALUES ('${dbName}', 'blue'), ('${dbName}', 'red');`,
  );

  await queryPg(physical, "SELECT color FROM db_identifier;");

  // Create database roles for impersonation
  await queryPg(
    physical,
    `
      DO $$
      BEGIN
          -- Create role if it doesn't exist. Roles are CLUSTER-level, so the
          -- IF NOT EXISTS check can be lost to a concurrent worker between the
          -- SELECT and the CREATE; swallowing duplicate_object makes this
          -- idempotent under that race. Everything below is per-DATABASE and so
          -- is already private to this slot.
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blue_role') THEN
              BEGIN
                  CREATE ROLE blue_role;
              EXCEPTION WHEN duplicate_object THEN
                  NULL;
              END;
          END IF;

          -- Revoke existing privileges first
          REVOKE ALL ON db_identifier FROM blue_role;

          -- Drop policy if it exists
          IF EXISTS (
              SELECT 1 FROM pg_policies
              WHERE tablename = 'db_identifier'
              AND policyname = 'blue_policy'
          ) THEN
              DROP POLICY blue_policy ON db_identifier;
              RAISE NOTICE 'Dropped existing blue_policy';
          END IF;

          -- Grant fresh permissions
          GRANT SELECT ON db_identifier TO blue_role;
          ALTER TABLE db_identifier ENABLE ROW LEVEL SECURITY;

        -- Create policy
          CREATE POLICY blue_policy ON db_identifier
          FOR SELECT TO blue_role
          USING (color = 'blue');
      END
      $$;
  `,
  );
}

// === sync completion ===

type TaskRunsResponse = {
  total: number;
  data: { id: number; run_type: string; status: string }[];
};

/**
 * Block until every sync task run the backend has started for `databaseId` has
 * FINISHED, i.e. the single-thread sync executor holds no more work for it.
 *
 * WHY `initial_sync_status` IS NOT ENOUGH. `POST /api/database` publishes
 * `:event/database-create`, whose handler (src/metabase/sync/events/sync_database.clj)
 * does `quick-task/submit-task!` of `sync/sync-database!` for an `is_full_sync`
 * database. `sync-database!` runs THREE phases — `:metadata`, `:analyze`,
 * `:field-values` (src/metabase/sync/sync.clj `scan-phases`) — and
 * `initial_sync_status` is flipped to `complete` inside phase ONE
 * (`sync-util/set-initial-database-sync-complete!`, src/metabase/sync/util.clj:456).
 * So the old poll returned with analyze + field-values still to run.
 *
 * WHY THAT MATTERS BEYOND WASTED CPU. `quick-task/submit-task!`
 * (src/metabase/util/quick_task.clj:25) is a `newFixedThreadPool(1)` held in a
 * `defonce` — ONE queue for the whole JVM, i.e. for every spec that runs on this
 * backend afterwards. And `with-duplicate-ops-prevented` (src/metabase/sync/util.clj:102)
 * SILENTLY skips a sync for a database that already has one in flight: no error,
 * no retry, and `POST /sync_schema` has already returned `{"status":"ok"}`
 * because it only reports that the task was SUBMITTED. A spec that returns while
 * its sync is still queued can therefore make the NEXT spec's sync a no-op, and
 * the next spec sees a database that simply never gains its tables. That is the
 * leading explanation for the `database-writable-connection` beforeEach that
 * timed out at 90s with `GET /api/database/2/metadata` returning identical
 * `tables: []` 346 times, immediately after this spec on the same shard.
 * (Mechanism inferred from the code; not reproduced locally.)
 *
 * WHY TASK RUNS AND NOT A SLEEP. `do-sync-operation*` (src/metabase/sync/util.clj:283)
 * wraps the whole operation in `task-history/with-task-run` with
 * `{:run_type :sync, :entity_type :database, :entity_id <id>}`, whose status goes
 * `started` -> `success`/`failed`. `GET /api/task/runs?entity-type=database&entity-id=<id>`
 * exposes exactly that, so completion is READ from the backend rather than
 * guessed at with a timer.
 *
 * The `total > 0` half is not decoration: the run row is created when the task
 * REACHES the executor, not when it is submitted, so "no started runs" is also
 * true of a sync that is still sitting in the queue. Callers reach this only
 * after `initial_sync_status` has flipped, which already proves the operation
 * started — the check is belt-and-braces for any other caller.
 *
 * ONLY FOR DATABASES THAT ACTUALLY SYNC. A destination (router-child) database
 * never does — `database/should-sync?` (src/metabase/warehouses/models/database.clj:230)
 * is `(not (is-destination? db))`, so its create event reaches
 * `do-sync-operation`, finds it ineligible, and no run row is EVER written.
 * Calling this for one would block until the timeout rather than return early.
 * VERIFIED against a live slot backend, not deduced: the spec's two destination
 * databases sat at `initial_sync_status: "incomplete"` with zero task runs.
 */
export async function waitForDatabaseSyncToFinish(
  api: MetabaseApi,
  databaseId: number,
  label = `database ${databaseId}`,
) {
  await expect
    .poll(
      async () => {
        const body = (await (
          await api.get(
            `/api/task/runs?entity-type=database&entity-id=${databaseId}`,
          )
        ).json()) as TaskRunsResponse;
        return (
          body.total > 0 && body.data.every(({ status }) => status !== "started")
        );
      },
      { timeout: 120_000, message: `${label} sync tasks to drain` },
    )
    .toBe(true);
}

// === port of H.addPostgresDatabase(displayName, false, dbName, idAlias) ===

/**
 * Port of H.addPostgresDatabase → addQADatabase (e2e-qa-databases-helpers.js)
 * for the non-writable (`writable = false`) path this spec uses, with `dbName`
 * threaded through. Returns the new database id (upstream aliases it).
 *
 * DIVERGENCE, deliberate, setup-only: upstream's post-create sync wait
 * (`assertOnDatabaseMetadata`) resolves the database to poll with
 * `body.data.find(db => db.engine === "postgres")` — i.e. the FIRST postgres
 * database, which after `restore("postgres-writable")` is the pre-existing
 * "Writable Postgres12", never the database just added. Upstream therefore
 * doesn't actually wait for `lead`/`destination_one` to sync and relies on the
 * subsequent metadata read racing it. This port polls the database it just
 * created instead, and then waits for the sync to actually FINISH rather than
 * merely to have flipped `initial_sync_status` (see
 * `waitForDatabaseSyncToFinish`). That changes no assertion — it removes a setup
 * race and stops this spec leaking queued sync work onto the next one.
 *
 * `dbName` is the LOGICAL name; `details.dbname` is resolved through
 * `routingDbName`.
 */
export async function addPostgresDatabase(
  api: MetabaseApi,
  displayName: string,
  dbName: string,
): Promise<number> {
  const response = await api.post("/api/database", {
    engine: "postgres",
    name: displayName,
    details: {
      dbname: routingDbName(dbName),
      host: QA_DB_CREDENTIALS.host,
      port: QA_POSTGRES_PORT,
      user: QA_DB_CREDENTIALS.user,
      password: QA_DB_CREDENTIALS.password,
      "additional-options": null,
      "tunnel-enabled": false,
    },
    auto_run_queries: true,
    is_full_sync: true,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  });
  const { id } = (await response.json()) as { id: number };

  await expect
    .poll(
      async () => {
        const db = (await (await api.get(`/api/database/${id}`)).json()) as {
          initial_sync_status: string;
        };
        return db.initial_sync_status;
      },
      { timeout: 60_000, message: `database ${displayName} initial sync` },
    )
    .toBe("complete");

  // `initial_sync_status` only covers the metadata phase — see
  // waitForDatabaseSyncToFinish for why returning here leaks analyze and
  // field-values work onto the shared single-thread executor.
  await waitForDatabaseSyncToFinish(api, id, `database ${displayName}`);

  return id;
}

type DatabaseMetadata = {
  tables: {
    id: number;
    name: string;
    fields: { id: number; name: string }[];
  }[];
};

/**
 * The `GET /api/database/:id/metadata?include_hidden=true` +
 * `_.findWhere(tables, { name: "db_identifier" })` /
 * `_.findWhere(fields, { name: "color" })` lookup upstream does inline, twice.
 * Wrapped in a poll for the same reason as the sync wait above: the table and
 * its fields appear in stages.
 */
export async function getDbIdentifierIds(
  api: MetabaseApi,
  databaseId: number,
): Promise<{ tableId: number; colorFieldId: number }> {
  let result: { tableId: number; colorFieldId: number } | undefined;
  await expect
    .poll(
      async () => {
        const body = (await (
          await api.get(`/api/database/${databaseId}/metadata?include_hidden=true`)
        ).json()) as DatabaseMetadata;
        const table = body.tables?.find(({ name }) => name === "db_identifier");
        const colorField = table?.fields?.find(({ name }) => name === "color");
        if (table && colorField) {
          result = { tableId: table.id, colorFieldId: colorField.id };
          return true;
        }
        return false;
      },
      { timeout: 60_000, message: `db_identifier metadata for db ${databaseId}` },
    )
    .toBe(true);
  return result!;
}

export { ALL_USERS_GROUP, COLLECTION_GROUP };

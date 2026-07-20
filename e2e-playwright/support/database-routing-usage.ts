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
 */
import type { MetabaseApi } from "./api";
import {
  ALL_USERS_GROUP,
  QA_POSTGRES_PORT,
} from "./database-routing-admin";
import { COLLECTION_GROUP } from "./dashboard-repros";
import { expect } from "./fixtures";

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
  return queryPg("writable_db", query);
}

/**
 * Port of createDbWithIdentifierTable (e2e-database-routing-helpers.ts).
 *
 * Creates the database if it doesn't exist, then (re)creates `db_identifier`
 * with two rows both named after the database — one blue, one red — plus the
 * `blue_role` role and the row-level-security policy the impersonation test
 * relies on. Statement-for-statement faithful to upstream; the only change is
 * knex-direct instead of cy.task.
 */
export async function createDbWithIdentifierTable({
  dbName,
}: {
  dbName: string;
}) {
  const existing = await queryWritableDB(
    `SELECT datname from pg_database WHERE datname = '${dbName}'`,
  );
  if (existing.rows.length === 0) {
    await queryWritableDB(`CREATE DATABASE ${dbName};`);
  }

  await queryPg(
    dbName,
    "DROP TABLE IF EXISTS db_identifier; CREATE TABLE db_identifier (name VARCHAR(50), color VARCHAR(20));",
  );

  await queryPg(
    dbName,
    `INSERT INTO db_identifier VALUES ('${dbName}', 'blue'), ('${dbName}', 'red');`,
  );

  await queryPg(dbName, "SELECT color FROM db_identifier;");

  // Create database roles for impersonation
  await queryPg(
    dbName,
    `
      DO $$
      BEGIN
          -- Create role if it doesn't exist
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blue_role') THEN
              CREATE ROLE blue_role;
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
 * created instead. That changes no assertion — it only removes a setup race.
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
      dbname: dbName,
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

/**
 * Helpers for the filter-bigint spec port
 * (e2e/test/scenarios/filters/filter-bigint.cy.spec.ts).
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9).
 *
 * The only thing here that isn't in a shared module is the writable-QA-DB
 * table builder: `support/actions-on-dashboards.ts resetTestTable` only knows
 * `scoreboard_actions` / `many_data_types`, and this spec needs
 * `bigint_pk_table` / `decimal_pk_table` (e2e/support/test_tables.js). The knex
 * plumbing mirrors that module's, deliberately duplicated rather than widening
 * a file another agent owns.
 *
 * PRECISION NOTE (the whole point of this spec): every id in these tables is
 * inserted as a **string**, exactly as `e2e/support/test_tables.js` does.
 * `-9223372036854775808` and `9223372036854775808` are not representable as JS
 * numbers, so a numeric literal here would silently seed the wrong data and
 * the spec would pass while testing nothing.
 */
import type { MetabaseApi } from "./api";
import { WRITABLE_DB_ID, resyncDatabase } from "./schema-viewer";
import { writableDbConfig } from "./writable-db";

export const BIGINT_PK_TABLE_NAME = "bigint_pk_table";
export const DECIMAL_PK_TABLE_NAME = "decimal_pk_table";

// Connection facts live in support/writable-db.ts, which resolves this
// worker's own writable database (writable_db_w<slot>) when per-worker
// isolation is on.

type KnexClient = {
  schema: {
    dropTableIfExists(name: string): Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTable(name: string, cb: (table: any) => void): Promise<unknown>;
  };
  (tableName: string): { insert(rows: Record<string, unknown>[]): Promise<unknown> };
  destroy(): Promise<void>;
};

function knexClient(): KnexClient {
  // Lazy require: knex/pg are not dependencies of this package, they resolve
  // from the repo-root node_modules (the same drivers Cypress uses). The
  // module must still load when PW_QA_DB_ENABLED is off and they may be absent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  return Knex(writableDbConfig("postgres"));
}

/**
 * Port of H.resetTestTable({ type: "postgres", table }) for the two tables
 * this spec uses — the knex schema-builder calls are transcribed verbatim from
 * `bigint_pk_table` / `decimal_pk_table` in e2e/support/test_tables.js.
 */
export async function resetTestTable(
  table: typeof BIGINT_PK_TABLE_NAME | typeof DECIMAL_PK_TABLE_NAME,
) {
  const client = knexClient();
  try {
    await client.schema.dropTableIfExists(table);
    if (table === BIGINT_PK_TABLE_NAME) {
      await client.schema.createTable(table, (t) => {
        t.bigInteger("id").primary();
        t.string("name");
      });
      await client(table).insert([
        { id: "-9223372036854775808", name: "Negative" },
        { id: "0", name: "Zero" },
        { id: "9223372036854775807", name: "Positive" },
      ]);
    } else {
      await client.schema.createTable(table, (t) => {
        t.decimal("id", 38, 0).primary();
        t.string("name");
      });
      await client(table).insert([
        { id: "-9223372036854775809", name: "Negative" },
        { id: "0", name: "Zero" },
        { id: "9223372036854775808", name: "Positive" },
      ]);
    }
  } finally {
    await client.destroy();
  }
}

/**
 * Port of the spec's module-level setupTables(): restore the postgres-writable
 * snapshot, rebuild both test tables, resync the writable database.
 *
 * The `signIn` is harness plumbing the Cypress original doesn't need: our
 * MetabaseApi sends an explicit X-Metabase-Session, so the caller has to
 * re-establish it against the freshly restored app DB before the API calls
 * below (PORTING: "Reorder signIn FIRST when porting a beforeEach that hits an
 * admin API").
 */
export async function setupTables(mb: {
  api: MetabaseApi;
  restore(name?: string): Promise<void>;
  signInAsAdmin(): Promise<void>;
}) {
  await mb.restore("postgres-writable");
  await mb.signInAsAdmin();
  await resetTestTable(BIGINT_PK_TABLE_NAME);
  await resetTestTable(DECIMAL_PK_TABLE_NAME);
  await resyncDatabase(mb.api, {
    dbId: WRITABLE_DB_ID,
    tables: [BIGINT_PK_TABLE_NAME, DECIMAL_PK_TABLE_NAME],
  });
}

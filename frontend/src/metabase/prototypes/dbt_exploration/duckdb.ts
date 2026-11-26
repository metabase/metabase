import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { RESULTS } from "./results.generated";
import type { ResultTable } from "./types";

// Copied here by project/run.sh rather than bundled: rspack would hold the
// 34 MB engine in the dev server's memory. Metabase serves this path from
// resources/frontend_client, on the page's own origin as a worker requires.
const ASSET_PATH = "/app/dist/duckdb";
const WASM_URL = `${ASSET_PATH}/duckdb-eh.wasm`;
const WORKER_URL = `${ASSET_PATH}/duckdb-browser-eh.worker.js`;

const SEED_TABLES = ["customers", "invoices", "time_entries"] as const;

// Same names as the dbt models, inside a `demo` catalog like the dbt DuckDB
// file, so naive_join.sql and the SQL MetricFlow generated run unchanged.
const SETUP_SQL = `
  ATTACH ':memory:' AS demo;
  USE demo;
  ${SEED_TABLES.map(
    (table) =>
      `CREATE TABLE ${table} AS SELECT * FROM read_csv('${table}.csv');`,
  ).join("\n")}
  CREATE VIEW dim_customers AS SELECT * FROM customers;
  CREATE VIEW fct_invoices AS SELECT * FROM invoices;
  CREATE VIEW fct_time_entries AS SELECT * FROM time_entries;
`;

// One connection for the page: `USE demo` only applies to the connection it
// ran on.
let connectionPromise: Promise<AsyncDuckDBConnection> | undefined;

/**
 * Runs `sql` in an in-browser DuckDB loaded with the dbt project's seeds.
 * The database starts on the first call and is shared afterwards.
 */
export async function runQuery(sql: string): Promise<ResultTable> {
  const connection = await getConnection();
  const table = await connection.query(sql);
  const fields = table.schema.fields;
  return {
    columns: fields.map((field) => field.name),
    rows: table.toArray().map((row: { toJSON(): Record<string, unknown> }) => {
      const values = row.toJSON();
      return fields.map((field) =>
        formatValue(values[field.name], String(field.type)),
      );
    }),
  };
}

function getConnection() {
  connectionPromise ??= openConnection().catch((error: unknown) => {
    connectionPromise = undefined;
    throw error;
  });
  return connectionPromise;
}

async function openConnection() {
  const workerResponse = await fetch(WORKER_URL, { method: "HEAD" });
  if (!workerResponse.ok) {
    throw new Error(
      `DuckDB files are missing from ${ASSET_PATH}. Run frontend/src/metabase/prototypes/dbt_exploration/project/run.sh.`,
    );
  }

  const duckdb = await import("@duckdb/duckdb-wasm");
  const database = new duckdb.AsyncDuckDB(
    new duckdb.VoidLogger(),
    new Worker(WORKER_URL),
  );
  await database.instantiate(WASM_URL);
  await database.open({
    query: {
      castBigIntToDouble: true,
      castDecimalToDouble: true,
      castTimestampToDate: true,
    },
  });

  await Promise.all(
    SEED_TABLES.map((table) =>
      database.registerFileText(
        `${table}.csv`,
        RESULTS.files[`${table}.csv`] ?? "",
      ),
    ),
  );
  const connection = await database.connect();
  await connection.query(SETUP_SQL);

  return connection;
}

function formatValue(value: unknown, type: string): string {
  if (value == null) {
    return "";
  }
  const isDate = type.startsWith("Date");
  const isTimestamp = type.startsWith("Timestamp");
  const isTemporalValue = typeof value === "number" || value instanceof Date;
  if ((isDate || isTimestamp) && isTemporalValue) {
    const iso = new Date(value).toISOString();
    return isDate ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
  }
  return String(value);
}

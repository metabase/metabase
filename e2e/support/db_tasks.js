import Knex from "knex";

import { QA_DB_CONFIG, WRITABLE_DB_CONFIG } from "./cypress_data";
import { Roles } from "./test_roles";
import * as testTables from "./test_tables";

const dbClients = {};

function getDbClient(connectionConfig) {
  const connectionId =
    connectionConfig.client + connectionConfig.connection.database;

  // we only need to create one client per db per run
  if (!dbClients[connectionId]) {
    dbClients[connectionId] = Knex(connectionConfig);
  }

  return dbClients[connectionId];
}

export async function connectAndQueryDB({ connectionConfig, query }) {
  const dbClient = getDbClient(connectionConfig);

  const result = await dbClient.raw(query);

  if (connectionConfig.client === "mysql2") {
    // make mysql results look like pg results
    return { rows: result[0] };
  }

  if (connectionConfig.client === "pg") {
    return result;
  }
}

/**
 * For postgres, drops all schemas except for public, and drops all tables from the public schema.
 *
 * For mysql, drops all user created tables from the writable_db database.
 */
export async function resetWritableDb({ type = "postgres" }) {
  const dbClient = getDbClient(WRITABLE_DB_CONFIG[type]);

  if (type === "postgres") {
    const dontDrop = /^pg_|information_schema|public/;

    const { rows: schemas } = await dbClient.raw(
      "SELECT nspname as name FROM pg_namespace;",
    );

    if (!schemas?.length) {
      return null;
    }

    for (const schema of schemas) {
      if (!dontDrop.test(schema.name)) {
        await dbClient.raw(`DROP SCHEMA "${schema.name}" CASCADE;`);
      }
    }

    const { rows: tables } = await dbClient.raw(
      "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'",
    );

    if (!tables?.length) {
      return null;
    }

    for (const table of tables) {
      await dbClient.raw(`DROP TABLE public.${table.name};`);
    }
  } else if (type === "mysql") {
    const { rows: tables } = await dbClient.raw(
      "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'writable_db';",
    );

    if (!tables?.length) {
      return null;
    }

    for (const table of tables) {
      await dbClient.raw(`DROP TABLE ${table.name};`);
    }
  }
  return null;
}

export async function resetTable({ type = "postgres", table = "testTable1" }) {
  const dbClient = getDbClient(WRITABLE_DB_CONFIG[type]);

   
  return testTables?.[table]?.(dbClient);
}

export async function createTestRoles({
  type = "postgres",
  isWritable = false,
}) {
  const config = isWritable ? WRITABLE_DB_CONFIG : QA_DB_CONFIG;
  const dbClient = getDbClient(config[type]);

  const dbRoles = Roles[type];
  if (!dbRoles) {
    return;
  }

  return await Promise.all(
    Object.values(dbRoles).map(async (sql) => {
      await dbClient.raw(sql);
    }),
  );
}

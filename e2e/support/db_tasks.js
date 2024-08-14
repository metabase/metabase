import Knex from "knex";

import { WRITABLE_DB_CONFIG, QA_DB_CONFIG } from "./cypress_data";
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
export async function resetTable({ type = "postgres", table = "testTable1" }) {
  const dbClient = getDbClient(WRITABLE_DB_CONFIG[type]);

  // eslint-disable-next-line import/namespace
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
    Object.values(dbRoles).map(async sql => {
      await dbClient.raw(sql);
    }),
  );
}

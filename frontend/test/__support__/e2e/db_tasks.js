import fs from "fs";
import { ACTIONS_DB_CONFIG } from "./cypress_data";
const Knex = require("knex");

const actionsDbClients = {};

export function getDbClient(connectionConfig) {
  const connectionId =
    connectionConfig.client + connectionConfig.connection.database;

  // we only need to create one client per db per run
  if (!actionsDbClients[connectionId]) {
    actionsDbClients[connectionId] = Knex(connectionConfig);
  }

  return actionsDbClients[connectionId];
}

export async function connectAndQueryDB({ connectionConfig, query }) {
  const dbClient = getDbClient(connectionConfig);

  const result = await dbClient.raw(query);

  if (connectionConfig.client === "mysql2") {
    return { rows: result[0] };
  }

  if (connectionConfig.client === "pg") {
    return result;
  }
}

export async function resetActionsDb({ type = "postgres" }) {
  const sampleSQL = fs.readFileSync("./helpers/sample_schema.sql", "utf8");

  const sampleInsert = await connectAndQueryDB({
    connectionConfig: ACTIONS_DB_CONFIG[type],
    query: sampleSQL,
  });

  const testSql = fs.readFileSync("./helpers/test_schema.sql", "utf8");

  const testInsert = await connectAndQueryDB({
    connectionConfig: ACTIONS_DB_CONFIG[type],
    query: testSql,
  });

  return [...sampleInsert, ...testInsert];
}

export async function resetSimpleTestTable({ type = "postgres" }) {
  const dbClient = getDbClient(ACTIONS_DB_CONFIG[type]);

  await dbClient.schema.dropTableIfExists("test_table");
  await dbClient.schema.createTable("test_table", function (table) {
    table.increments("id").primary();
    table.string("name");
    table.integer("rating");
  });

  await dbClient("test_table").insert([
    { name: "John" },
    { name: "Jane" },
    { name: "Jack" },
    { name: "Jill" },
    { name: "Jenny" },
  ]);

  return true;
}

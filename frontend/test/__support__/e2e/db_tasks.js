import Knex from "knex";

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

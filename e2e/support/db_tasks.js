import Knex from "knex";

import { QA_DB_CONFIG, WRITABLE_DB_CONFIG } from "./cypress_data";
import { Roles } from "./test_roles";
import * as testTables from "./test_tables";

const dbClients = {};
const existingWritableDbs = new Set();

function getDbClient(connectionConfig) {
  const connectionId =
    connectionConfig.client +
    connectionConfig.connection.database +
    connectionConfig.connection.user;

  // we only need to create one client per db per run
  if (!dbClients[connectionId]) {
    dbClients[connectionId] = Knex(connectionConfig);
  }

  return dbClients[connectionId];
}

export async function connectAndQueryDB({ connectionConfig, query }) {
  const writableDbType = getWritableDbType(connectionConfig);
  if (writableDbType) {
    await createWritableDb({ type: writableDbType });
  }

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

function getWritableDbType(connectionConfig) {
  return Object.keys(WRITABLE_DB_CONFIG).find((type) => {
    const { client, connection } = WRITABLE_DB_CONFIG[type];
    return (
      client === connectionConfig.client &&
      connection.database === connectionConfig.connection.database
    );
  });
}

/**
 * For postgres, drops all schemas except for public, and drops all tables from the public schema.
 *
 * For mysql, drops all user created tables from the writable_db database.
 */
export async function resetWritableDb({ type = "postgres" }) {
  await createWritableDb({ type });

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
      await dbClient.raw(`DROP TABLE IF EXISTS public.${table.name} CASCADE;`);
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

function getAdminConnectionConfig(type) {
  return {
    postgres: QA_DB_CONFIG.postgres,
    mysql: {
      ...QA_DB_CONFIG.mysql,
      connection: { ...QA_DB_CONFIG.mysql.connection, user: "root" },
    },
  }[type];
}

async function writableDbExists(type) {
  if (existingWritableDbs.has(type)) {
    return true;
  }

  const dbName = WRITABLE_DB_CONFIG[type].connection.database;

  const dbCheckQuery = {
    postgres: `SELECT FROM pg_database WHERE datname = '${dbName}';`,
    mysql: `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${dbName}'`,
  }[type];

  const { rows } = await connectAndQueryDB({
    connectionConfig: getAdminConnectionConfig(type),
    query: dbCheckQuery,
  });

  const exists = rows.length > 0;
  if (exists) {
    existingWritableDbs.add(type);
  }

  return exists;
}

async function assertWritableDbExists(type) {
  if (!(await writableDbExists(type))) {
    const dbName = WRITABLE_DB_CONFIG[type].connection.database;
    throw new Error(
      `The ${type} "${dbName}" database does not exist. Restore the "${type}-writable" snapshot or call setupWritableDB("${type}") first.`,
    );
  }
}

export async function createWritableDb({ type = "postgres" }) {
  if (!(await writableDbExists(type))) {
    const dbName = WRITABLE_DB_CONFIG[type].connection.database;
    await connectAndQueryDB({
      connectionConfig: getAdminConnectionConfig(type),
      query: `CREATE DATABASE ${dbName};`,
    });
    existingWritableDbs.add(type);
  }

  return null;
}

export async function resetTable({ type = "postgres", table = "testTable1" }) {
  await assertWritableDbExists(type);

  const dbClient = getDbClient(WRITABLE_DB_CONFIG[type]);
  return testTables?.[table]?.(dbClient);
}

export async function createTestRoles({
  type = "postgres",
  isWritable = false,
}) {
  if (isWritable) {
    await assertWritableDbExists(type);
  }

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

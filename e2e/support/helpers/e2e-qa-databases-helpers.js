import {
  QA_DB_CONFIG,
  QA_DB_CREDENTIALS,
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
  WRITABLE_DB_CONFIG,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";

import { createQuestion } from "./api";

/*****************************************
 **            QA DATABASES             **
 ******************************************/

export function addMongoDatabase(displayName = "QA Mongo") {
  // https://hub.docker.com/layers/metabase/qa-databases/mongo-sample-4.4/images/sha256-8cdeaacf28c6f0a6f9fde42ce004fcc90200d706ac6afa996bdd40db78ec0305
  return addQADatabase({
    engine: "mongo",
    displayName,
    port: QA_MONGO_PORT,
  });
}

export function addPostgresDatabase(
  displayName = "QA Postgres12",
  writable = false,
  dbName,
  idAlias,
) {
  // https://hub.docker.com/layers/metabase/qa-databases/postgres-sample-12/images/sha256-80bbef27dc52552d6dc64b52796ba356d7541e7bba172740336d7b8a64859cf8
  return addQADatabase({
    engine: "postgres",
    displayName,
    dbName,
    port: QA_POSTGRES_PORT,
    enable_actions: writable,
    idAlias,
  });
}

export function addMySQLDatabase({
  displayName = "QA MySQL8",
  writable = false,
}) {
  // https://hub.docker.com/layers/metabase/qa-databases/mysql-sample-8/images/sha256-df67db50379ec59ac3a437b5205871f85ab519ce8d2cdc526e9313354d00f9d4
  return addQADatabase({
    engine: "mysql",
    displayName: displayName,
    port: QA_MYSQL_PORT,
    enable_actions: writable,
  });
}

function addQADatabase({
  engine,
  displayName,
  dbName,
  port,
  enable_actions = false,
  idAlias,
}) {
  const PASS_KEY = engine === "mongo" ? "pass" : "password";
  const AUTH_DB = engine === "mongo" ? "admin" : null;
  const OPTIONS = engine === "mysql" ? "allowPublicKeyRetrieval=true" : null;

  const db_name =
    dbName ??
    (enable_actions
      ? WRITABLE_DB_CONFIG[engine].connection.database
      : QA_DB_CREDENTIALS.database);

  const credentials = enable_actions
    ? WRITABLE_DB_CONFIG[engine].connection
    : QA_DB_CREDENTIALS;

  cy.log(`**-- Adding ${engine.toUpperCase()} DB --**`);
  return cy
    .request("POST", "/api/database", {
      engine: engine,
      name: displayName,
      details: {
        dbname: db_name,
        host: credentials.host,
        port: port,
        user: credentials.user,
        [PASS_KEY]: QA_DB_CREDENTIALS.password, // NOTE: we're inconsistent in where we use `pass` vs `password` as a key
        authdb: AUTH_DB,
        "additional-options": OPTIONS,
        "use-srv": false,
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
    })
    .then(({ status, body }) => {
      expect(status).to.equal(200);
      cy.wrap(body.id).as(idAlias ?? `${engine}ID`);
    })
    .then((dbId) => {
      // Make sure we have all the metadata because we'll need to use it in tests
      assertOnDatabaseMetadata(engine);

      // it's important that we don't enable actions until sync is complete
      if (dbId && enable_actions) {
        cy.log("**-- Enabling actions --**");
        cy.request("PUT", `/api/database/${dbId}`, {
          settings: { "database-enable-actions": true },
        }).then(({ status }) => {
          expect(status).to.equal(200);
        });
      }
    });
}

function assertOnDatabaseMetadata(engine) {
  cy.request("GET", "/api/database").then(({ body }) => {
    const { id } = body.data.find((db) => {
      return db.engine === engine;
    });

    recursiveCheck(id);
  });
}

function recursiveCheck(id, i = 0) {
  // Let's not wait more than 20s for the sync to finish
  if (i === 20) {
    cy.task(
      "log",
      "The DB sync isn't complete yet, but let's be optimistic about it",
    );
    return;
  }

  cy.wait(1000);

  cy.request("GET", `/api/database/${id}`).then(({ body: database }) => {
    cy.task("log", {
      dbId: database.id,
      syncStatus: database.initial_sync_status,
    });
    if (database.initial_sync_status !== "complete") {
      recursiveCheck(id, ++i);
    } else {
      recursiveCheckFields(id);
    }
  });
}

function recursiveCheckFields(id, i = 0) {
  // Let's not wait more than 10s for the sync to finish
  if (i === 10) {
    cy.task("log", "The field sync isn't complete");
    return;
  }

  cy.wait(1000);

  cy.request("GET", `/api/database/${id}/schemas`).then(({ body: schemas }) => {
    const [schema] = schemas;
    if (schema) {
      cy.request("GET", `/api/database/${id}/schema/${schema}`)
        .then(({ body: schema }) => {
          return schema[0].id;
        })
        .then((tableId) => {
          cy.request("GET", `/api/table/${tableId}/query_metadata`).then(
            ({ body: table }) => {
              const field = table.fields.find(
                (field) => field.semantic_type !== "type/PK",
              );
              if (!field.last_analyzed) {
                recursiveCheckFields(id, ++i);
              }
            },
          );
        });
    }
  });
}

export const setupWritableDB = (type = "postgres") => {
  const connectionConfig = {
    postgres: {
      client: "pg",
      connection: {
        ...QA_DB_CREDENTIALS,
        port: QA_POSTGRES_PORT,
      },
    },
    mysql: {
      client: "mysql2",
      connection: {
        ...QA_DB_CREDENTIALS,
        user: "root",
        port: QA_MYSQL_PORT,
      },
    },
  };

  const dbName = WRITABLE_DB_CONFIG[type].connection.database;

  const dbCheckQuery = {
    postgres: `SELECT FROM pg_database WHERE datname = '${dbName}';`,
    mysql: `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${dbName}'`,
  };

  // we need to initially connect to the db we know exists to create the writable_db
  cy.task("connectAndQueryDB", {
    connectionConfig: connectionConfig[type],
    query: dbCheckQuery[type],
  }).then((results) => {
    if (!results.rows.length) {
      cy.log(`**-- Adding ${type} DB for actions --**`);
      cy.task("connectAndQueryDB", {
        connectionConfig: connectionConfig[type],
        query: `CREATE DATABASE ${dbName};`,
      });
    }
  });
};

export function queryQADB(query, type = "postgres") {
  return cy.task("connectAndQueryDB", {
    connectionConfig: QA_DB_CONFIG[type],
    query,
  });
}

/**
 * Executes a query against a writable database
 * @param {string} query - The SQL query to execute
 * @param {("postgres"|"mysql")} [type="postgres"] - Database type to connect to
 * @returns {Cypress.Chainable<{rows: any[]}>} - Cypress chainable that resolves to query results
 */
export function queryWritableDB(query, type = "postgres") {
  return cy.task("connectAndQueryDB", {
    connectionConfig: WRITABLE_DB_CONFIG[type],
    query,
  });
}

export function resetWritableDb({ type = "postgres" }) {
  cy.log(`Resetting ${type} writable DB`);
  cy.task("resetWritableDb", { type });
}

/**
 * Note: this function MUST come after the restore() function in the file, or it will get wiped out
 */
export function resetTestTable({ type, table }) {
  cy.task("resetTable", { type, table });
}

export function createTestRoles({ type, isWritable }) {
  cy.task("createTestRoles", { type, isWritable });
}

// will this work for multiple schemas?
/**
 * @param {Object} obj
 * @param {string} [obj.databaseId] - Defaults to WRITABLE_DB_ID
 * @param {string} obj.name - The table's real name, not its display name
 */
export function getTableId({ databaseId = WRITABLE_DB_ID, name }) {
  return cy
    .request("GET", `/api/database/${databaseId}/metadata`)
    .then(({ body }) => {
      const table = body?.tables?.find((table) => table.name === name);
      return table ? table.id : null;
    });
}

export function getTable({ databaseId = WRITABLE_DB_ID, name }) {
  return cy
    .request("GET", `/api/database/${databaseId}/metadata`)
    .then(({ body }) => {
      const table = body?.tables?.find((table) => table.name === name);
      return table || null;
    });
}

export const createModelFromTableName = ({
  tableName,
  modelName = "Test Action Model",
  idAlias = "modelId",
}) => {
  getTableId({ name: tableName }).then((tableId) => {
    createQuestion(
      {
        database: WRITABLE_DB_ID,
        name: modelName,
        query: {
          "source-table": tableId,
        },
        type: "model",
      },
      {
        wrapId: true,
        idAlias,
      },
    );
  });
};

export function waitForSyncToFinish({
  iteration = 0,
  dbId = 2,
  tableName = "",
  tableAlias,
}) {
  // 40 x 500ms (20s) should be plenty of time for the sync to finish.
  if (iteration === 40) {
    throw new Error("The sync is taking too long. Something is wrong.");
  }

  cy.wait(500);

  cy.request("GET", `/api/database/${dbId}/metadata`).then(({ body }) => {
    if (!body.tables.length) {
      return waitForSyncToFinish({
        iteration: ++iteration,
        dbId,
        tableName,
        tableAlias,
      });
    } else if (tableName) {
      const table = body.tables.find(
        (table) =>
          table.name === tableName && table.initial_sync_status === "complete",
      );

      if (!table) {
        return waitForSyncToFinish({
          iteration: ++iteration,
          dbId,
          tableName,
          tableAlias,
        });
      }

      if (tableAlias) {
        cy.wrap(table).as(tableAlias);
      }

      return null;
    }
  });
}

export function resyncDatabase({
  dbId = 2,
  tableName = "",
  tableAlias = undefined, // TS was complaining that this was a required param
}) {
  // must be signed in as admin to sync
  cy.request("POST", `/api/database/${dbId}/sync_schema`);
  cy.request("POST", `/api/database/${dbId}/rescan_values`);
  waitForSyncToFinish({ iteration: 0, dbId, tableName, tableAlias });
}

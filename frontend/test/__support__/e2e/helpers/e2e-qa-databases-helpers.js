import {
  QA_POSTGRES_PORT,
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
} from "__support__/e2e/cypress_data";

/*****************************************
 **            QA DATABASES             **
 ******************************************/

export function addMongoDatabase(name = "QA Mongo4") {
  // https://hub.docker.com/layers/metabase/qa-databases/mongo-sample-4.0/images/sha256-3f568127248b6c6dba0b114b65dc3b3bf69bf4c804310eb57b4e3de6eda989cf
  addQADatabase("mongo", name, QA_MONGO_PORT);
}

export function addPostgresDatabase(name = "QA Postgres12") {
  // https://hub.docker.com/layers/metabase/qa-databases/postgres-sample-12/images/sha256-80bbef27dc52552d6dc64b52796ba356d7541e7bba172740336d7b8a64859cf8
  addQADatabase("postgres", name, QA_POSTGRES_PORT);
}

export function addWritablePostgresDatabase(name = "Writable Postgres12") {
  addQADatabase("postgres", name, 5432, true);
}

export function addMySQLDatabase(name = "QA MySQL8") {
  // https://hub.docker.com/layers/metabase/qa-databases/mysql-sample-8/images/sha256-df67db50379ec59ac3a437b5205871f85ab519ce8d2cdc526e9313354d00f9d4
  addQADatabase("mysql", name, QA_MYSQL_PORT);
}

function addQADatabase(engine, db_display_name, port, enable_actions = false) {
  const PASS_KEY = engine === "mongo" ? "pass" : "password";
  const AUTH_DB = engine === "mongo" ? "admin" : null;
  const OPTIONS = engine === "mysql" ? "allowPublicKeyRetrieval=true" : null;

  const db_name = enable_actions ? "actions_db" : "sample";

  cy.log(`**-- Adding ${engine.toUpperCase()} DB --**`);
  cy.request("POST", "/api/database", {
    engine: engine,
    name: db_display_name,
    details: {
      dbname: db_name,
      host: "localhost",
      port: port,
      user: "metabase",
      [PASS_KEY]: "metasample123", // NOTE: we're inconsistent in where we use `pass` vs `password` as a key
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
      cy.wrap(body.id).as(`${engine}ID`);
    })
    .then(dbId => {
      // Make sure we have all the metadata because we'll need to use it in tests
      assertOnDatabaseMetadata(engine);

      // it's important that we don't enable actions until sync is complete
      if (dbId && enable_actions) {
        cy.log(`**-- Enabling actions --**`);
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
    const { id } = body.data.find(db => {
      return db.engine === engine;
    });

    recursiveCheck(id);
  });
}

function recursiveCheck(id, i = 0) {
  // Let's not wait more than 5s for the sync to finish
  if (i === 20) {
    throw new Error("The sync is taking too long. Something is wrong.");
  }

  cy.wait(250);

  cy.request("GET", `/api/database/${id}`).then(({ body: database }) => {
    if (database.initial_sync_status !== "complete") {
      recursiveCheck(id, ++i);
    }
  });
}

const sampleConfig = {
  user: "metabase",
  password: "metasample123",
  host: "localhost",
  database: "sample",
  ssl: false,
  port: 5432,
};

const actionsConfig = {
  ...sampleConfig,
  database: "actions_db",
};

export function restoreActionsDB() {
  // we need to initially connect to the db we know exists to create the actions_db
  cy.task("connectAndQueryDB", {
    connectionConfig: sampleConfig,
    query: `SELECT FROM pg_database WHERE datname = 'actions_db';`,
  }).then(results => {
    if (!results.rows.length) {
      cy.log("**-- Adding Postgres DB for actions --**");
      cy.task("connectAndQueryDB", {
        connectionConfig: sampleConfig,
        query: `CREATE DATABASE actions_db;`,
      });
    }
  });

  // https://www.postgresql.org/docs/current/sql-copy.html ??
  cy.log("-- Restoring Actions DB Data --");
  cy.task("connectAndQueryDB", {
    connectionConfig: actionsConfig,
    query: /*sql*/ `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        rating INTEGER DEFAULT 0
      );
      INSERT INTO test_table (name) VALUES ('John'), ('Jane'), ('Jack'), ('Jill'), ('Jenny');
    `,
  });
}

export function queryActionsDB(query) {
  return cy.task("connectAndQueryDB", {
    connectionConfig: actionsConfig,
    query,
  });
}

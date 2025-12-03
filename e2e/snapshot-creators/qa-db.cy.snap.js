import {
  addMongoDatabase,
  addMySQLDatabase,
  addPostgresDatabase,
  restore,
  setupWritableDB,
  snapshot,
} from "e2e/support/helpers";

describe("qa databases snapshots", { tags: "@external" }, () => {
  it("creates snapshots for supported qa databases", () => {
    // Mongo
    restoreAndAuthenticate();

    addMongoDatabase();
    snapshot("mongo-5");

    // Postgres
    restoreAndAuthenticate();

    addPostgresDatabase();
    snapshot("postgres-12");

    convertToWritable("postgres");
    snapshot("postgres-writable");

    // MySQL
    restoreAndAuthenticate();

    addMySQLDatabase({});
    snapshot("mysql-8");

    convertToWritable("mysql");
    snapshot("mysql-writable");

    restore("blank");
  });
});

function restoreAndAuthenticate() {
  restore("default");
  cy.signInAsAdmin();
}

/**
 * Takes the existing postgres or mysql database, creates a new database with the
 * name `writable_db` if it doesn't exist already, and then alters the connection
 * details to point to that new database.
 *
 * @param {"postgres" | "mysql"} engine
 */
function convertToWritable(engine) {
  setupWritableDB(engine);

  const idAlias = `@${engine}ID`;

  cy.get(idAlias).then((id) => {
    cy.log("**-- Enabling actions --**");
    cy.request("PUT", `/api/database/${id}`, {
      name: engine === "postgres" ? "Writable Postgres12" : "Writable MySQL8",
      details: {
        dbname: "writable_db",
        ...(engine === "mysql" ? { user: "root" } : {}),
      },
      settings: { "database-enable-actions": true },
    });
  });
}

import {
  addMongoDatabase,
  addMySQLDatabase,
  addPostgresDatabase,
  restore,
  setupWritableDB,
  snapshot,
} from "e2e/support/helpers";

describe("qa databases snapshots", { tags: "@external" }, () => {
  beforeEach(() => {
    restoreAndAuthenticate();
  });

  it("creates snapshots for supported qa databases", () => {
    if (Cypress.env("QA_DB_MONGO") === true) {
      addMongoDatabase();
      snapshot("mongo-5");

      restoreAndAuthenticate();
    } else {
      addPostgresDatabase();
      snapshot("postgres-12");

      setupWritableDB("postgres");
      cy.get("@postgresID").then((id) => {
        cy.log("**-- Enabling actions --**");
        cy.request("PUT", `/api/database/${id}`, {
          details: {
            dbname: "writable_db",
          },
          settings: { "database-enable-actions": true },
        });
      });
      // restoreAndAuthenticate();
      // addPostgresDatabase("Writable Postgres12", true);
      snapshot("postgres-writable");
      restoreAndAuthenticate();

      addMySQLDatabase({});
      snapshot("mysql-8");
      restoreAndAuthenticate();

      setupWritableDB("mysql");
      addMySQLDatabase({ displayName: "Writable MySQL8", writable: true });
      snapshot("mysql-writable");
      restoreAndAuthenticate();
    }

    restore("blank");
  });
});

function restoreAndAuthenticate() {
  restore("default");
  cy.signInAsAdmin();
}

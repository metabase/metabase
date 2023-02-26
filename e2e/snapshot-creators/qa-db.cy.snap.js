import {
  restore,
  snapshot,
  addPostgresDatabase,
  addMongoDatabase,
  addMySQLDatabase,
  setupWritableDB,
} from "e2e/support/helpers";

describe("qa databases snapshots", { tags: "@external" }, () => {
  beforeEach(() => {
    restoreAndAuthenticate();
  });

  it("creates snapshots for supported qa databases", () => {
    addPostgresDatabase();
    snapshot("postgres-12");
    deleteDatabase("postgresID");

    restoreAndAuthenticate();

    addMySQLDatabase();
    snapshot("mysql-8");
    deleteDatabase("mysqlID");

    restoreAndAuthenticate();

    addMongoDatabase();
    snapshot("mongo-4");
    deleteDatabase("mongoID");

    restoreAndAuthenticate();

    setupWritableDB("mysql");
    addMySQLDatabase("Writable MySQL8", true);
    snapshot("mysql-writable");
    deleteDatabase("mysqlID");

    restoreAndAuthenticate();

    setupWritableDB("postgres");
    addPostgresDatabase("Writable Postgres12", true);
    snapshot("postgres-writable");
    deleteDatabase("postgresID");

    restore("blank");
  });
});

function restoreAndAuthenticate() {
  restore("default");
  cy.signInAsAdmin();
}

function deleteDatabase(idAlias) {
  cy.get("@" + idAlias).then(id => {
    return cy.request("DELETE", `/api/database/${id}`);
  });
}

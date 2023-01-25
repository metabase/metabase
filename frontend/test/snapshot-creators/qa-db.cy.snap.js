import {
  restore,
  snapshot,
  addPostgresDatabase,
  addWritablePostgresDatabase,
  addMongoDatabase,
  addMySQLDatabase,
} from "__support__/e2e/helpers";

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

    addWritablePostgresDatabase();
    snapshot("postgresActions");
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

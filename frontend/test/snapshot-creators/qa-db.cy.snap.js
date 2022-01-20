import {
  restore,
  snapshot,
  addPostgresDatabase,
  addMongoDatabase,
  addMySQLDatabase,
} from "__support__/e2e/cypress";

describe("qa databases snapshots", () => {
  beforeEach(() => {
    restoreAndAuthenticate();
  });

  it("creates snapshots for supported qa databases", () => {
    addPostgresDatabase();
    snapshot("postgres-12");

    restoreAndAuthenticate();

    cy.wait(1000);
    addMySQLDatabase();
    snapshot("mysql-8");

    restoreAndAuthenticate();

    cy.wait(1000);
    addMongoDatabase();
    snapshot("mongo-4");

    restore("blank");
  });
});

function restoreAndAuthenticate() {
  restore("default");
  cy.signInAsAdmin();
}

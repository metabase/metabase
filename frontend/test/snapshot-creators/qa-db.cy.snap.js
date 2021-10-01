import {
  restore,
  snapshot,
  addPostgresDatabase,
  addMongoDatabase,
} from "__support__/e2e/cypress";

describe("qa databases snapshots", () => {
  beforeEach(() => {
    restoreAndAuthenticate();
  });

  it("creates snapshots for supported qa databases", () => {
    addPostgresDatabase();
    snapshot("postgres-12");

    restoreAndAuthenticate();

    addMongoDatabase();
    snapshot("mongo-4");

    restore("blank");
  });
});

function restoreAndAuthenticate() {
  restore("default");
  cy.signInAsAdmin();
}

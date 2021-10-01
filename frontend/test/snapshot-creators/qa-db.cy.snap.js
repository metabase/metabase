import {
  restore,
  snapshot,
  addPostgresDatabase,
  addMongoDatabase,
} from "__support__/e2e/cypress";

describe("qa databases snapshots", () => {
  beforeEach(() => {
    restore("default");
    cy.signInAsAdmin();
  });

  it("creates snapshots for supported qa databases", () => {
    addPostgresDatabase();
    snapshot("postgres-12");

    restore("default");

    addMongoDatabase();
    snapshot("mongo-4");

    restore("blank");
  });
});

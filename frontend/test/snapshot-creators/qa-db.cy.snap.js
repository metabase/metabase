import {
  restore,
  snapshot,
  addPostgresDatabase,
} from "__support__/e2e/cypress";

describe("qa databases snapshots", () => {
  beforeEach(() => {
    restore("default");
    cy.signInAsAdmin();
  });

  it("creates snapshots for supported qa databases", () => {
    addPostgresDatabase();
    snapshot("postgres-12");

    restore("blank");
  });
});

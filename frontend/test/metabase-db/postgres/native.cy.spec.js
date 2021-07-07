import { restore, addPostgresDatabase, modal } from "__support__/e2e/cypress";

const PG_DB_NAME = "QA Postgres12";

// Skipping the whole describe block because it contains only one skipped test so far!
// We don't want to run the whole beforeEeach block in CI only to skip the test afterwards.
// IMPORTANT: when #14957 gets fixed, unskip both describe block and the test itself!
describe.skip("postgres > question > native", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    addPostgresDatabase(PG_DB_NAME);
  });

  it.skip("should save a question before query has been executed (metabase#14957)", () => {
    cy.visit("/question/new");
    cy.findByText("Native query").click();
    cy.findByText(PG_DB_NAME).click();
    cy.get(".ace_content").type("select pg_sleep(60)");
    cy.findByText("Save").click();
    cy.findByLabelText("Name").type("14957");
    cy.button("Save").click();
    modal().should("not.exist");
  });
});

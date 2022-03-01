import { restore, modal } from "__support__/e2e/cypress";

const PG_DB_NAME = "QA Postgres12";

describe.skip("issue 14957", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.findByText("Native query").click();
    cy.findByText(PG_DB_NAME)
      .should("be.visible")
      .click();
  });

  it("should save a question before query has been executed (metabase#14957)", () => {
    cy.get(".ace_content").type("select pg_sleep(60)");

    cy.findByText("Save").click();

    cy.findByLabelText("Name").type("14957");
    cy.button("Save").click();

    modal().should("not.exist");
  });
});

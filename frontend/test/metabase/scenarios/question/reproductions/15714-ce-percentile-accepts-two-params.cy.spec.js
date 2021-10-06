import { restore } from "__support__/e2e/cypress";

const PG_DB_NAME = "QA Postgres12";

describe("postgres > question > custom columns", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("Orders").click();
  });

  it("`Percentile` custom expression function should accept two parameters (metabase#15714)", () => {
    cy.icon("add_data").click();
    cy.get("[contenteditable='true']")
      .click()
      .type("Percentile([Subtotal], 0.1)");
    cy.findByPlaceholderText("Something nice and descriptive")
      .as("description")
      .click();

    cy.findByText("Function Percentile expects 1 argument").should("not.exist");
    cy.get("@description").type("A");
    cy.button("Done")
      .should("not.be.disabled")
      .click();
    // Todo: Add positive assertions once this is fixed
  });
});

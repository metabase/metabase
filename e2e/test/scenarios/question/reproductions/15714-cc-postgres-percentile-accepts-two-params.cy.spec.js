import {
  enterCustomColumnDetails,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";

const PG_DB_NAME = "QA Postgres12";

describe("postgres > question > custom columns", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(PG_DB_NAME).should("be.visible").click();
    cy.findByTextEnsureVisible("Orders").click();
  });

  it("`Percentile` custom expression function should accept two parameters (metabase#15714)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick the metric you want to see").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "Percentile([Subtotal], 0.1)" });
    cy.findByPlaceholderText("Something nice and descriptive")
      .as("description")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Function Percentile expects 1 argument").should("not.exist");
    cy.get("@description").type("A");
    cy.button("Done").should("not.be.disabled").click();
    // Todo: Add positive assertions once this is fixed
  });
});

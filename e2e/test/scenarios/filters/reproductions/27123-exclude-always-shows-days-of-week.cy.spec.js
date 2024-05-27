import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, popover, tableHeaderClick } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
    limit: 100,
  },
};

describe("issue 27123", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("exclude filter should not resolve to 'Days of the week' regardless of the chosen granularity  (metabase#27123)", () => {
    tableHeaderClick("Created At");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclude…").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Months of the year…").click();

    popover()
      .should("contain", "Months of the year…")
      .and("contain", "January");
  });
});

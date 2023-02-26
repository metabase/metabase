import { restore, popover } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    cy.findAllByTestId("header-cell").contains("Created At").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Exclude...").click();
    cy.findByText("Months of the year...").click();

    popover()
      .should("contain", "Months of the year...")
      .and("contain", "January");
  });
});

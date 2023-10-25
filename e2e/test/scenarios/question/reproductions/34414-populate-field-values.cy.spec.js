import { popover, restore, startNewQuestion } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { INVOICES_ID } = SAMPLE_DATABASE;

describe("issue 34414", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("Populate field values after re-adding filter on virtual table field (metabase#33079)", () => {
    cy.createQuestion({
      name: "Invoices Model",
      query: { "source-table": INVOICES_ID },
      dataset: true,
    });

    startNewQuestion();

    popover().within(() => {
      cy.findByText("Models").click();
      cy.findByText("Invoices Model").click();
    });

    cy.findAllByTestId("notebook-cell-item").contains("Add filters").click();

    popover().within(() => {
      cy.findByText("Plan").click();
      assertPlanFieldValues();

      cy.log("Open filter again");
      cy.findByTestId("sidebar-header-title").click();

      cy.log("Open plan field again");
      cy.findByText("Plan").click();

      assertPlanFieldValues();
    });
  });
});

function assertPlanFieldValues() {
  cy.contains("Basic");
  cy.contains("Business");
  cy.contains("Premium");
}

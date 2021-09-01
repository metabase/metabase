import { restore, addMongoDatabase, popover } from "__support__/e2e/cypress";

const MONGO_DB_NAME = "QA Mongo4";

// Skipping the whole describe block because it contains only one skipped test so far!
// We don't want to run the whole beforeEeach block in CI only to skip the test afterwards.
// IMPORTANT: when #16170 gets fixed, unskip both describe block and the test itself!
describe.skip("mongodb > visualization > line chart", () => {
  before(() => {
    restore();
    cy.signInAsAdmin();
    addMongoDatabase(MONGO_DB_NAME);
  });

  it.skip("should correctly replace only the missing values with zero (metabase#16170)", () => {
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText(MONGO_DB_NAME).click();
    cy.findByText("Orders").click();
    cy.findAllByRole("button")
      .contains("Summarize")
      .click();
    cy.findByTestId("sidebar-right")
      .findByText("Created At")
      .click();
    assertOnTheYAxis();
    cy.findAllByRole("button")
      .contains("Settings")
      .click();
    cy.findByTestId("sidebar-left")
      .findByText("Linear Interpolated")
      .click();
    popover()
      .findByText("Zero")
      .click();
    assertOnTheYAxis();

    function assertOnTheYAxis() {
      cy.get(".y-axis-label").findByText("Count");
      cy.get(".axis.y .tick")
        .should("have.length.gt", 10)
        .and("contain", "200");
    }
  });
});

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visualize, openTable } from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

function pickMetric(metric) {
  cy.contains("Pick the metric").click();

  cy.contains(metric).click();
  cy.findByText("Price");
  cy.findByText("Rating");
}
describe("issue 4482", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openTable({
      table: PRODUCTS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "Summarize" }).click();
  });

  it("should be possible to summarize min of a temporal column (metabase#4482-1)", () => {
    pickMetric("Minimum of");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Created At").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 1, 2022, 12:00 AM");
  });

  it("should be possible to summarize max of a temporal column (metabase#4482-2)", () => {
    pickMetric("Maximum of");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Created At").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 1, 2025, 12:00 AM");
  });

  it("should be not possible to average a temporal column (metabase#4482-3)", () => {
    pickMetric("Average of");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").should("not.exist");
  });
});

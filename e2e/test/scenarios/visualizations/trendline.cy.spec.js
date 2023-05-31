import { restore, leftSidebar } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "12781",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["avg", ["field", ORDERS.SUBTOTAL, null]],
      ["sum", ["field", ORDERS.TOTAL, null]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

describe("scenarios > question > trendline", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("displays trendline when there are multiple numeric outputs (for simple question) (metabase#12781)", () => {
    // Change settings to trendline
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    cy.findByTestId("viz-settings-button").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Display").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Trend line").parent().children().last().click();

    // Check graph is still there
    cy.get("rect");

    // Remove sum of total
    leftSidebar().within(() => {
      cy.findByText("Data").click();
      cy.icon("close").last().click();
      cy.findByText("Done").click();
    });

    // Graph should still exist
    cy.findByPlaceholderText("Created At").should("not.exist");
    cy.get("rect");
  });
});

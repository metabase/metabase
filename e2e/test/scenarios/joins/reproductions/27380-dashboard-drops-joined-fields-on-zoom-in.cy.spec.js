import { restore, visitDashboard } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
};

describe.skip("issue 27380", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );
  });

  it("should not drop fields from joined table on dashboard 'zoom-in' (metabase#27380)", () => {
    // Doesn't really matter which 'circle" we click on the graph
    cy.get("circle").last().realClick();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Zoom in").click();
    cy.wait("@dataset");

    // Graph should still exist
    // Let's check only the y-axis label
    cy.get("y-axis-label").invoke("text").should("eq", "Count");

    cy.icon("notebook").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Products? → Created At: Month/);
  });
});

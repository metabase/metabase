import { restore, popover, visualize } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PRODUCTS, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "18770",
  query: {
    "source-query": {
      aggregation: [["count"]],
      "source-table": ORDERS_ID,
      breakout: [
        ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
  },
};

describe.skip("issue 18770", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("post-aggregation filter shouldn't affect the drill-through options (metabase#18770)", () => {
    cy.icon("notebook").click();
    // It is important to manually triger "visualize" in order to generate `result_metadata`
    // Otherwise, we might get false negative even when this issue gets resolved.
    // In order to do that, we have to change the breakout field first or it will never generate and send POST /api/dataset request.
    cy.findAllByTestId("notebook-cell-item")
      .contains(/Products? → Title/)
      .click();
    popover().findByText("Category").click();
    cy.findAllByTestId("notebook-cell-item").contains(/Products? → Category/);

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("4,784").click();
    popover()
      .should("contain", "See these Orders")
      .and("contain", "Break out by a…")
      .and("contain", "Filter by this value")
      .and("contain", "Automatic explorations");
  });
});

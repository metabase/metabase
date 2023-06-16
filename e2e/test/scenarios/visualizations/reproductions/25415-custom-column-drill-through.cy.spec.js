import { popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 25415", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow to drill-through aggregated query with a custom column on top level (metabase#25415)", () => {
    cy.createQuestion(
      {
        name: "Aggregated query with custom column",
        display: "line",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.PRODUCT_ID, null]],
          },
          expressions: {
            "test custom": [
              "*",
              [
                "field",
                "count",
                {
                  "base-type": "type/Integer",
                },
              ],
              2,
            ],
          },
        },
      },
      { visitQuestion: true },
    );

    cy.get(".dc-tooltip-list").get(".dot").first().click({ force: true });

    popover().findByText("See these Orders").click();

    // filter applied
    cy.findByTestId("qb-filters-panel").should("contain", "Product ID is 1");

    // there is a table with data
    cy.findByTestId("TableInteractive-root").should("exist");
  });
});

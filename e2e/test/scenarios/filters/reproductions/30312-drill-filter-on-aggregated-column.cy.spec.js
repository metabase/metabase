import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { popover, restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const CREATED_AT_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

describe("issue 30312", function () {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("can use a drill filter on an aggregated column (metabase#30312)", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [CREATED_AT_BREAKOUT],
          limit: 5, // optimization
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findAllByTestId("header-cell")
      .eq(1)
      .should("have.text", "Count")
      .click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Enter a number").type("10");
      cy.realPress("Tab");
      cy.button("Add filter").should("be.enabled").click();
    });

    cy.findByTestId("qb-filters-panel").should(
      "contain.text",
      "Count is equal to 10",
    );
  });
});

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  popover,
  queryBuilderMain,
  restore,
  selectFilterOperator,
  tableHeaderClick,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const CREATED_AT_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

describe("issue 30312", () => {
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

    cy.findAllByTestId("header-cell").eq(1).should("have.text", "Count");

    tableHeaderClick("Count");

    popover().findByText("Filter by this column").click();
    selectFilterOperator("Equal to");
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("10");
      cy.realPress("Tab");
      cy.button("Add filter").should("be.enabled").click();
    });

    cy.findByTestId("filter-pill").should("have.text", "Count is equal to 10");
    queryBuilderMain().findByText("No results!").should("be.visible");
  });
});

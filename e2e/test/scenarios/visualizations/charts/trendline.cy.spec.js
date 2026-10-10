const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > question > trendline", () => {
  function setup(questionDetails) {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(questionDetails, { visitQuestion: true });
  }

  it("should handle per-series trend line settings (metabase#12781)", () => {
    setup({
      name: "Per-series trend line settings",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["avg", ["field", ORDERS.SUBTOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
    H.openVizSettingsSidebar();
    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Trend line").click();
    });
    H.trendLine().should("have.length", 2);

    H.leftSidebar().within(() => {
      cy.findByText("Data").click();
      cy.findByTestId("settings-avg").click();
    });
    H.popover().within(() => {
      cy.findByText("Show trend line for this series").click();
    });
    H.trendLine().should("have.length", 1);

    H.popover().within(() => {
      cy.findByText("Show trend line for this series").click();
    });
    H.trendLine().should("have.length", 2);
    cy.realPress("Escape");

    H.leftSidebar().within(() => {
      cy.findByTestId("remove-sum").click();
      cy.findByText("Done").click();
    });
    H.trendLine().should("have.length", 1);
    H.cartesianChartCircle().should("exist");
  });

  it("should display trend line for stack-100% chart (metabase#25614)", () => {
    setup({
      name: "25614",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"], ["avg", ["field", PRODUCTS.PRICE, null]]],
        breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "bar",
    });
    H.openVizSettingsSidebar();
    // stack 100%, then enable trend line
    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Stack - 100%").click();
      cy.findByText("Trend line").click();
    });
    // ensure that two trend lines are present
    H.trendLine().should("have.length", 2);
  });
});

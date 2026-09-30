const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > question > trendline", () => {
  function setup(questionDetails) {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(questionDetails, { visitQuestion: true });
  }

  it("displays trendline when there are multiple numeric outputs (for simple question) (metabase#12781)", () => {
    setup({
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
    });

    // Change settings to trendline
    H.openVizSettingsSidebar();
    H.leftSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Trend line").click();
    });

    // Check graph is still there
    cy.get("rect");

    // Remove sum of total
    H.leftSidebar().within(() => {
      cy.findByText("Data").click();
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.icon("close").last().click({ force: true });
      cy.findByText("Done").click();
    });

    // Graph should still exist
    cy.findByPlaceholderText("Created At").should("not.exist");
    cy.get("rect");
  });

  it("should handle per-series trend line settings", () => {
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
  });
});

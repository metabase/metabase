import {
  enterCustomColumnDetails,
  openOrdersTable,
  restore,
  visualize,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const segmentDetails = {
  name: "OrdersSegment",
  description: "All orders with a total under $100.",
  table_id: ORDERS_ID,
  definition: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    filter: ["<", ["field", ORDERS.TOTAL, null], 100],
  },
};

const customColumnDetails = {
  name: "CustomColumn",
  formula: 'case([OrdersSegment], "Segment", "Other")',
};

describe("issue 24922", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("POST", "/api/segment", segmentDetails);
  });

  it("should allow segments in case custom expressions (metabase#24922)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.findByText("Custom column").click();
    enterCustomColumnDetails(customColumnDetails);
    cy.button("Done").click();

    visualize();
    cy.findByText("CustomColumn").should("be.visible");
  });
});

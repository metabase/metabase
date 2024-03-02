import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  enterCustomColumnDetails,
  openOrdersTable,
  restore,
  visualize,
} from "e2e/support/helpers";
import { createSegment } from "e2e/support/helpers/e2e-table-metadata-helpers";

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
    createSegment(segmentDetails);
  });

  it("should allow segments in case custom expressions (metabase#24922)", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails(customColumnDetails);
    cy.button("Done").click();

    visualize();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("CustomColumn").should("be.visible");
  });
});

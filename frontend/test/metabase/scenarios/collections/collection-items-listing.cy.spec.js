import _ from "underscore";
import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > collection items listing", () => {
  describe("pagination", () => {
    const PAGE_SIZE = 25;
    const ADDED_QUESTIONS = 13;
    const ADDED_DASHBOARDS = 12;
    const PRE_EXISTED_ITEMS = 4;

    const TOTAL_ITEMS = ADDED_DASHBOARDS + ADDED_QUESTIONS + PRE_EXISTED_ITEMS;

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      _.times(12, i => cy.createDashboard(`dashboard ${i}`));
      _.times(13, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
            ],
          },
        }),
      );
    });

    it("should allow to navigate back and forth", () => {
      cy.visit("/collection/root");

      // First page
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);

      cy.findByTestId("next-page-btn").click();

      // Second page
      cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should(
        "have.length",
        TOTAL_ITEMS - PAGE_SIZE,
      );
      cy.findByTestId("next-page-btn").should("be.disabled");

      cy.findByTestId("previous-page-btn").click();

      // First page
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);
    });
  });
});

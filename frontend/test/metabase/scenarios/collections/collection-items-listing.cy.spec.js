import _ from "underscore";
import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > collection items listing", () => {
  const TEST_QUESTION_QUERY = {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  };

  const PAGE_SIZE = 25;

  describe("pagination", () => {
    const ADDED_QUESTIONS = 15;
    const ADDED_DASHBOARDS = 14;

    const TOTAL_ITEMS = ADDED_DASHBOARDS + ADDED_QUESTIONS;

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      // Removes questions and dashboards included in a default dataset,
      // so the test won't fail if we change the default dataset
      cy.request("GET", "/api/collection/root/items").then(response => {
        response.body.data.forEach(({ model, id }) => {
          if (model !== "collection") {
            cy.request("PUT", `/api/${model}/${id}`, {
              archived: true,
            });
          }
        });
      });

      _.times(ADDED_DASHBOARDS, i => cy.createDashboard(`dashboard ${i}`));
      _.times(ADDED_QUESTIONS, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
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

import _ from "underscore";
import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const PAGE_SIZE = 50;
const TOTAL_ITEMS = PAGE_SIZE + 1;

describe("scenarios > search", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not search on an empty string", () => {
    cy.intercept("/api/search", req => {
      expect("Unexpected call to /api/search").to.be.false;
    });
    cy.visit("/");
    cy.findByPlaceholderText("Search…").type(" ");
  });

  it("should allow users to paginate results", () => {
    generateQuestions(TOTAL_ITEMS);

    cy.visit("/");
    cy.findByPlaceholderText("Search…").type("generated question{enter}");
    cy.findByTestId("previous-page-btn").should("be.disabled");

    // First page
    cy.findByText(`1 - ${PAGE_SIZE}`);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("search-result-item").should("have.length", PAGE_SIZE);

    cy.findByTestId("next-page-btn").click();

    // Second page
    cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("search-result-item").should("have.length", 1);
    cy.findByTestId("next-page-btn").should("be.disabled");

    cy.findByTestId("previous-page-btn").click();

    // First page
    cy.findByText(`1 - ${PAGE_SIZE}`);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("search-result-item").should("have.length", PAGE_SIZE);
  });
});

const generateQuestions = count => {
  _.range(count).map(i =>
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
};

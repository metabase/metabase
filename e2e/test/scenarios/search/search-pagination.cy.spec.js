import _ from "underscore";

import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const PAGE_SIZE = 50;
const TOTAL_ITEMS = PAGE_SIZE + 1;

describe("scenarios > search", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not search on an empty string", () => {
    cy.intercept("/api/search", req => {
      expect("Unexpected call to /api/search").to.be.false;
    });
    H.visitFullAppEmbeddingUrl({
      url: "/",
      qs: { top_nav: true, search: true },
    });
    H.getSearchBar().type(" ");
  });

  it("should allow users to paginate results", () => {
    generateQuestions(TOTAL_ITEMS);

    cy.visit("/");
    H.commandPaletteSearch("generated_question");
    cy.findByLabelText("Previous page").should("be.disabled");

    // First page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`1 - ${PAGE_SIZE}`);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("search-result-item").should("have.length", PAGE_SIZE);

    cy.findByLabelText("Next page").click();

    // Second page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("search-result-item").should("have.length", 1);
    cy.findByLabelText("Next page").should("be.disabled");

    cy.findByLabelText("Previous page").click();

    // First page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`1 - ${PAGE_SIZE}`);
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("search-result-item").should("have.length", PAGE_SIZE);
  });
});

const generateQuestions = count => {
  _.range(count).map(i =>
    cy.createQuestion({
      name: `generated_question ${i}`,
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

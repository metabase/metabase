import {
  restore,
  enterCustomColumnDetails,
  visualize,
  getNotebookStep,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "20519",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    joins: [
      {
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", "CATEGORY", { "base-type": "type/Text" }],
          ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
    limit: 2,
  },
};

describe("issue 20519", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
    switchToNotebookView();
  });

  // Tightly related issue: metabase#17767
  it("should allow subsequent joins and nested query after summarizing on the implicit joins (metabase#20519)", () => {
    cy.icon("add_data").last().click();

    enterCustomColumnDetails({
      formula: "1 + 1",
      name: "Two",
    });

    cy.button("Done").click();

    getNotebookStep("expression", { stage: 1 }).contains("Two").should("exist");

    visualize(response => {
      expect(response.body.error).not.to.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Doohickey");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Two");
  });
});

function switchToNotebookView() {
  cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
    "publicSchema",
  );

  cy.icon("notebook").click();
  cy.wait("@publicSchema");
}

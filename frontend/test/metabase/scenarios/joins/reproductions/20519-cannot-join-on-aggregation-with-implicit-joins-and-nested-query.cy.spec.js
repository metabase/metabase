import {
  restore,
  enterCustomColumnDetails,
  visualize,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

    visualize(response => {
      expect(response.body.error).not.to.exist;
    });

    cy.contains("Doohickey");
    cy.contains("Two");
  });
});

function switchToNotebookView() {
  cy.intercept("GET", "/api/database/1/schema/PUBLIC").as("publicSchema");

  cy.icon("notebook").click();
  cy.wait("@publicSchema");
}

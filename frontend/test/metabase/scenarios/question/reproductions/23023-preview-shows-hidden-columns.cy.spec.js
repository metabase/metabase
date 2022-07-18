import {
  restore,
  visitQuestionAdhoc,
  openNotebook,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
      fields: [
        ["field", ORDERS.ID, null],
        ["field", ORDERS.PRODUCT_ID, null],
      ],
    },
    type: "query",
  },
};

describe("issue 23023", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show only selected columns in a step preview (metabase#23023)", () => {
    visitQuestionAdhoc(questionDetails);

    openNotebook();

    cy.icon("play").eq(1).click();

    cy.findAllByTestId("header-cell").contains("Products → Category");
    cy.findAllByTestId("header-cell").contains("Tax").should("not.exist");
  });
});

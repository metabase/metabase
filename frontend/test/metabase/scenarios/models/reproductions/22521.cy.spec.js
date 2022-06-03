import { restore, popover, openQuestionActions } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "22521",
  dataset: true,
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
  },
};

describe.skip("issue 22521", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${PRODUCTS.VENDOR}`, {
      visibility_type: "details-only",
    });

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("models should respect data model column visibility (metabase#22521)", () => {
    openQuestionActions();
    cy.findByText("Edit query definition").click();

    cy.wait("@cardQuery");

    cy.findByTestId("step-join-0-0")
      .find(".Icon-table")
      .click();

    popover().should("not.contain", "Products → Vendor");
  });
});

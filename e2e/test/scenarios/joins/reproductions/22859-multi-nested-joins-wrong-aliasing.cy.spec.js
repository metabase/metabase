import {
  restore,
  popover,
  visualize,
  startNewQuestion,
  openOrdersTable,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "22859-Q1",
  query: {
    "source-table": REVIEWS_ID,
    joins: [
      {
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", REVIEWS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
  },
};

describe("issue 22859 - multiple levels of nesting", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("saveQuestion");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { wrapId: true, idAlias: "q1Id" });

    // Join Orders table with the previously saved question and save it again
    openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Saved Questions").click();
      cy.findByText(questionDetails.name).click();
    });

    popover().contains("Product ID").click();

    popover().contains("Product ID").click();

    visualize();

    saveQuestion("22859-Q2");

    cy.wait("@saveQuestion").then(({ response: { body } }) =>
      cy.wrap(body.id).as("q2Id"),
    );

    getJoinedTableColumnHeader();
  });

  it("model based on multi-level nested saved question should work (metabase#22859-1)", () => {
    cy.get("@q2Id").then(id => {
      // Convert the second question to a model
      cy.request("PUT", `/api/card/${id}`, { dataset: true });

      cy.visit(`/model/${id}`);
      cy.wait("@dataset");
    });

    getJoinedTableColumnHeader();
  });

  it("third level of nesting with joins should result in proper column aliasing (metabase#22859-2)", () => {
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Saved Questions").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("22859-Q2").click();

    visualize();

    getJoinedTableColumnHeader();
  });
});

function saveQuestion(name) {
  cy.findByText("Save").click();
  cy.findByDisplayValue("Orders").clear().type(name).blur();

  cy.button("Save").click();
  cy.button("Not now").click();
}

function getJoinedTableColumnHeader() {
  cy.get("@q1Id").then(id => {
    cy.findByText(`Question ${id} → ID`);
  });
}

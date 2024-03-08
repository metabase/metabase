import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  popover,
  restore,
  startNewQuestion,
  selectSavedQuestionsToJoin,
  visualize,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

const Q1 = {
  "source-table": ORDERS_ID,
  joins: [
    {
      fields: "all",
      alias: "Products",
      "source-table": PRODUCTS_ID,
      condition: [
        "=",
        ["field", ORDERS.PRODUCT_ID, null],
        ["field", PRODUCTS.ID, { "join-alias": "Products" }],
      ],
    },
    {
      fields: "all",
      alias: "People — User",
      "source-table": PEOPLE_ID,
      condition: [
        "=",
        ["field", ORDERS.USER_ID, null],
        ["field", PEOPLE.ID, { "join-alias": "People — User" }],
      ],
    },
  ],
  aggregation: [["count"]],
  breakout: [
    [
      "field",
      PRODUCTS.CATEGORY,
      { "base-type": "type/Text", "join-alias": "Products" },
    ],
  ],
};

const Q2 = {
  "source-table": PRODUCTS_ID,
  aggregation: [["count"]],
  breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
};

describe("issue 31769", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion({ name: "Q1", query: Q1 }).then(() => {
      cy.createQuestion({ name: "Q2", query: Q2 }).then(response => {
        cy.wrap(response.body.id).as("card_id_q2");
        startNewQuestion();
      });
    });
  });

  it("shouldn't drop joins using MLv2 format (metabase#31769)", () => {
    selectSavedQuestionsToJoin("Q1", "Q2");

    popover().findByText("Products → Category").click();
    popover().findByText("Category").click();

    visualize();

    // Asserting there're two columns from Q1 and two columns from Q2
    cy.findAllByTestId("header-cell").should("have.length", 4);

    cy.get("@card_id_q2").then(cardId => {
      cy.findByTestId("TableInteractive-root")
        .findByText("Q2 - Products → Category → Category")
        .should("exist");
    });

    cy.findByTestId("TableInteractive-root")
      .findByText("Products → Category")
      .should("exist");
  });
});

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  entityPickerModal,
  entityPickerModalTab,
  restore,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

const { REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID, ORDERS_ID, ORDERS } =
  SAMPLE_DATABASE;

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
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { wrapId: true, idAlias: "q1Id" });

    // Join Orders table with the previously saved question and save it again
    cy.get("@q1Id").then(id => {
      const nestedQuestionDetails = {
        name: "22859-Q2",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              alias: `Question ${id}`,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  REVIEWS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                    "join-alias": `Question ${id}`,
                  },
                ],
              ],
              "source-table": `card__${id}`,
            },
          ],
          limit: 5,
        },
      };

      cy.createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "q2Id",
      });
    });
  });

  it("model based on multi-level nested saved question should work (metabase#22859-1)", () => {
    cy.get("@q2Id").then(id => {
      // Convert the second question to a model
      cy.request("PUT", `/api/card/${id}`, { type: "model" });

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.visit(`/model/${id}`);
      cy.wait("@dataset");
    });

    getJoinedTableColumnHeader();
  });

  it("third level of nesting with joins should result in proper column aliasing (metabase#22859-2)", () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText("22859-Q2").click();
    });

    visualize();

    getJoinedTableColumnHeader();
  });
});

function getJoinedTableColumnHeader() {
  cy.get("@q1Id").then(id => {
    cy.findByText(`Question ${id} → ID`);
  });
}

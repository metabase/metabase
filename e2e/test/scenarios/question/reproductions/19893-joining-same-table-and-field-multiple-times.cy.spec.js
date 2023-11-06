import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const QUESTION_1 = {
  name: "Q1",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

const QUESTION_2 = {
  name: "Q2",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [
      ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
    ],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

describe("issue 19893", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display correct source table (metabase#19893)", () => {
    cy.createQuestion(QUESTION_1, { wrapId: true, idAlias: "questionId1" });
    cy.createQuestion(QUESTION_2, { wrapId: true, idAlias: "questionId2" });

    cy.then(function () {
      const { questionId1, questionId2 } = this;

      cy.createQuestion({
        name: "Q1 + Q2",
        query: {
          "source-table": `card__${questionId1}`,
          joins: [
            {
              fields: "all",
              strategy: "left-join",
              alias: "Q2 - Category",
              condition: [
                "=",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "base-type": "type/Text", "join-alias": "Q2 - Category" },
                ],
              ],
              "source-table": `card__${questionId2}`,
            },
          ],
        },
      }).then(({ body: question }) => {
        cy.visit(`/question/${question.id}/notebook`);
      });
    });

    cy.findAllByTestId("notebook-cell-item").then(items => {
      cy.wrap(items[0]).should("contain", QUESTION_1.name);
      cy.wrap(items[1]).should("contain", QUESTION_2.name);
    });

    cy.findByTestId("join-condition-0").within(() => {
      cy.findByLabelText("Left column").within(() => {
        cy.findByText(QUESTION_1.name).should("exist");
        cy.findByText("Category").should("exist");
      });

      cy.findByLabelText("Right column").within(() => {
        cy.findByText(QUESTION_2.name).should("exist");
        cy.findByText("Category").should("exist");
      });
    });
  });
});

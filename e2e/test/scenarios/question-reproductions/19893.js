import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, getNotebookStep } from "e2e/support/helpers";

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

  it.skip("should display correct join source table when joining visited questions (metabase#19893)", () => {
    cy.createQuestion(QUESTION_1, {
      wrapId: true,
      idAlias: "questionId1",
      visitQuestion: true,
    });
    cy.createQuestion(QUESTION_2, {
      wrapId: true,
      idAlias: "questionId2",
      visitQuestion: true,
    });

    cy.then(function () {
      const { questionId1, questionId2 } = this;

      createQ1PlusQ2Question(questionId1, questionId2).then(
        ({ body: question }) => {
          cy.visit(`/question/${question.id}/notebook`);
        },
      );
    });

    assertQ1PlusQ2Joins();
  });

  it.skip("should display correct join source table when joining non-visited questions (metabase#19893)", () => {
    cy.createQuestion(QUESTION_1, { wrapId: true, idAlias: "questionId1" });
    cy.createQuestion(QUESTION_2, { wrapId: true, idAlias: "questionId2" });

    cy.then(function () {
      const { questionId1, questionId2 } = this;

      createQ1PlusQ2Question(questionId1, questionId2).then(
        ({ body: question }) => {
          cy.visit(`/question/${question.id}/notebook`);
        },
      );
    });

    assertQ1PlusQ2Joins();
  });
});

const createQ1PlusQ2Question = (questionId1, questionId2) => {
  return cy.createQuestion({
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
  });
};

const assertQ1PlusQ2Joins = () => {
  getNotebookStep("join").within(() => {
    cy.findAllByTestId("notebook-cell-item").then(items => {
      cy.wrap(items[0]).should("contain", QUESTION_1.name);
      cy.wrap(items[1]).should("contain", QUESTION_2.name);
    });

    cy.findByLabelText("Left column").within(() => {
      cy.findByText(QUESTION_1.name).should("exist");
      cy.findByText("Category").should("exist");
    });

    cy.findByLabelText("Right column").within(() => {
      cy.findByText(QUESTION_2.name).should("exist");
      cy.findByText("Category").should("exist");
    });
  });
};

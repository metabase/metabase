import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  getNotebookStep,
  visualize,
  restore,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 44415", () => {
  beforeEach(() => {
    restore();
    cy.signIn("admin");
    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          filter: [
            "and",
            [
              "not-null",
              ["field", ORDERS.DISCOUNT, { "base-type": "type/Float" }],
            ],
          ],
        },
        visualization_settings: {
          "table.columns": [
            {
              name: "ID",
              fieldRef: ["field", ORDERS.ID, null],
              enabled: true,
            },
            {
              name: "DISCOUNT",
              fieldRef: ["field", ORDERS.DISCOUNT, null],
              enabled: true,
            },
          ],
        },
      },
      { wrapId: true },
    );
  });

  it("should be able to edit a table question in the notebook editor before running its query (metabase#44415)", () => {
    cy.get("@questionId").then(questionId =>
      cy.visit(`/question/${questionId}/notebook`),
    );

    getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    getNotebookStep("filter").should("not.exist");

    visualize();

    cy.findByTestId("qb-filters-panel").should("not.exist");
    cy.get("@questionId").then(questionId => {
      cy.url().should("not.include", `/question/${questionId}`);
      cy.url().should("include", "question#");
    });
  });
});

import {
  getNotebookStep,
  modal,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const TEST_QUERY = {
  "order-by": [["asc", ["field", "sum", { "base-type": "type/Float" }]]],
  limit: 10,
  filter: ["<", ["field", "sum", { "base-type": "type/Float" }], 100],
  "source-query": {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [
      [
        "field",
        PEOPLE.NAME,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
    ],
  },
};

describe("issue 31309", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should duplicate a model with its original aggregation and breakout", () => {
    cy.createQuestion(
      {
        name: "model",
        query: TEST_QUERY,
        type: "query",
        database: SAMPLE_DB_ID,
        dataset: true,
      },
      {
        visitQuestion: true,
      },
    );

    openQuestionActions();
    popover().findByText("Duplicate").click();

    modal().within(() => {
      cy.findByText("Duplicate").click();
    });

    modal().within(() => {
      cy.findByText("Not now").click();
    });

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Edit query definition").click();
    });

    cy.findByTestId("data-step-cell").findByText("Orders").should("exist");

    cy.findByTestId("aggregate-step")
      .findByText("Sum of Total")
      .should("exist");

    cy.findByTestId("breakout-step").findByText("User → Name").should("exist");

    getNotebookStep("filter", { stage: 1, index: 0 })
      .findByText("Sum of Total is less than 100")
      .should("exist");

    getNotebookStep("sort", { stage: 1, index: 0 })
      .findByText("Sum of Total")
      .should("exist");

    getNotebookStep("limit", { stage: 1, index: 0 })
      .findByDisplayValue("10")
      .should("exist");
  });
});

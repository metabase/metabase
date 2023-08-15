import {
  getNotebookStep,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const CC_NAME = "Is Promotion";

const QUESTION = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: ["distinct", ["field", 13, { "base-type": "type/Integer" }]],
      breakout: ["expression", CC_NAME],
      expressions: {
        [CC_NAME]: [
          "case",
          [[[">", ["field", 9, null], 0], 1]],
          { default: 0 },
        ],
      },
    },
  },
};

describe("issue 32625, issue 31635", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove dependent clauses when a clause is removed (metabase#32625, metabase#31635)", () => {
    visitQuestionAdhoc(QUESTION, { mode: "notebook" });

    getNotebookStep("expression")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    getNotebookStep("expression").should("not.exist");
    getNotebookStep("summarize").findByText(CC_NAME).should("not.exist");

    visualize();

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByTestId("scalar-value").should("have.text", "200");
      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
    });
  });
});

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  createQuestion,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow using OFFSET as a CASE argument (metabase#42377)", () => {
    const formula = "Sum(case([Total] > 0, Offset([Total], -1)))";
    const name = "Aggregation";
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };
    createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();

    cy.icon("sum").click();
    getNotebookStep("summarize")
      .findByText("Pick the metric you want to see")
      .click();
    popover().contains("Custom Expression").click();
    enterCustomColumnDetails({ formula, name });

    cy.on("uncaught:exception", error => {
      expect(error.message.includes("Error normalizing")).not.to.be.true;
    });
    // cy.findByLabelText("Expression").should("have.value", formula);
  });
});

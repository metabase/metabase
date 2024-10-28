import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  assertTableData,
  createQuestion,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const expressionName = "Expression";

const numberQuestionColumns = ["Total"];
const numberQuestionDetails: StructuredQuestionDetails = {
  query: {
    "source-table": ORDERS_ID,
    fields: [["field", ORDERS.TOTAL, null]],
    limit: 1,
    "order-by": [["asc", ["field", ORDERS.ID, null]]],
  },
};

type ExpressionTestCase = {
  name: string;
  questionDetails: StructuredQuestionDetails;
  questionColumns: string[];
  newExpression: string;
  newExpressionRows: string[][];
  modifiedExpression: string;
  modifiedExpressionRows: string[][];
};

const expressionTestCases: ExpressionTestCase[] = [
  {
    name: "between",
    questionDetails: numberQuestionDetails,
    questionColumns: numberQuestionColumns,
    newExpression: "between([Total], 20, 30)",
    newExpressionRows: [["39.72", "false"]],
    modifiedExpression: "between([Total], 30, 40)",
    modifiedExpressionRows: [["39.72", "true"]],
  },
];

describe("scenarios > custom column > boolean functions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("expression editor", () => {
    expressionTestCases.forEach(
      ({
        name,
        questionDetails,
        questionColumns,
        newExpression,
        newExpressionRows,
        modifiedExpression,
        modifiedExpressionRows,
      }) => {
        it(name, () => {
          createQuestion(questionDetails, { visitQuestion: true });

          cy.log("add a new custom column");
          openNotebook();
          getNotebookStep("data").button("Custom column").click();
          enterCustomColumnDetails({
            formula: newExpression,
            name: expressionName,
          });
          popover().button("Done").click();
          visualize();
          cy.wait("@dataset");
          assertTableData({
            columns: [...questionColumns, expressionName],
            firstRows: newExpressionRows,
          });

          cy.log("modify an existing custom column");
          openNotebook();
          getNotebookStep("expression").findByText(expressionName).click();
          enterCustomColumnDetails({
            formula: modifiedExpression,
            name: expressionName,
          });
          popover().button("Update").click();
          visualize();
          cy.wait("@dataset");
          assertTableData({
            columns: [...questionColumns, expressionName],
            firstRows: modifiedExpressionRows,
          });
        });
      },
    );
  });
});

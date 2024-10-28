import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  assertQueryBuilderRowCount,
  assertTableData,
  createQuestion,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  tableHeaderClick,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > custom column > boolean functions", () => {
  const expressionName = "Boolean column";

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("expression editor", () => {
    type ExpressionTestCase = {
      name: string;
      questionDetails: StructuredQuestionDetails;
      questionColumns: string[];
      newExpression: string;
      newExpressionRows: string[][];
      modifiedExpression: string;
      modifiedExpressionRows: string[][];
    };

    const stringQuestionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.CATEGORY, null]],
        "order-by": [["asc", ["field", PRODUCTS.ID, null]]],
        limit: 1,
      },
    };
    const stringQuestionColumns = ["Category"];

    const numberQuestionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.TOTAL, null]],
        "order-by": [["asc", ["field", ORDERS.ID, null]]],
        limit: 1,
      },
    };
    const numberQuestionColumns = ["Total"];

    const dateQuestionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.CREATED_AT, null]],
        "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
        limit: 1,
      },
    };
    const dateQuestionColumns = ["Created At"];

    const expressionTestCases: ExpressionTestCase[] = [
      {
        name: "isNull",
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: "isNull([Category])",
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: "notNull([Category])",
        modifiedExpressionRows: [["Gizmo", "true"]],
      },
      {
        name: "isEmpty",
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: "isEmpty([Category])",
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: "notEmpty([Category])",
        modifiedExpressionRows: [["Gizmo", "true"]],
      },
      {
        name: "startsWith",
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'startsWith([Category], "Gi")',
        newExpressionRows: [["Gizmo", "true"]],
        modifiedExpression: 'startsWith([Category], "mo")',
        modifiedExpressionRows: [["Gizmo", "false"]],
      },
      {
        name: "endsWith",
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'endsWith([Category], "Gi")',
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: 'endsWith([Category], "mo")',
        modifiedExpressionRows: [["Gizmo", "true"]],
      },
      {
        name: "contains",
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'contains([Category], "zm")',
        newExpressionRows: [["Gizmo", "true"]],
        modifiedExpression: 'contains([Category], "mz")',
        modifiedExpressionRows: [["Gizmo", "false"]],
      },
      {
        name: "doesNotContain",
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'doesNotContain([Category], "zm")',
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: 'doesNotContain([Category], "mz")',
        modifiedExpressionRows: [["Gizmo", "true"]],
      },
      {
        name: "between",
        questionDetails: numberQuestionDetails,
        questionColumns: numberQuestionColumns,
        newExpression: "between([Total], 20, 30)",
        newExpressionRows: [["39.72", "false"]],
        modifiedExpression: "between([Total], 30, 40)",
        modifiedExpressionRows: [["39.72", "true"]],
      },
      {
        name: "timeInterval",
        questionDetails: dateQuestionDetails,
        questionColumns: dateQuestionColumns,
        newExpression: 'interval([Created At], -30, "year")',
        newExpressionRows: [["April 30, 2022, 6:56 PM", "true"]],
        modifiedExpression: 'interval([Created At], 2, "month")',
        modifiedExpressionRows: [["April 30, 2022, 6:56 PM", "false"]],
      },
    ];

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

  describe("same stage", () => {
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [expressionName]: [
            "starts-with",
            ["field", PRODUCTS.CATEGORY, null],
            "Gi",
          ],
        },
      },
    };

    it("should be able to add a same-stage filter", () => {
      createQuestion(questionDetails, { visitQuestion: true });
      assertQueryBuilderRowCount(200);
      tableHeaderClick(expressionName);
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByLabelText("True").click();
        cy.findByText("Add filter").click();
      });
      assertQueryBuilderRowCount(51);
    });
  });

  describe("previous stage", () => {
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [expressionName]: [
            "starts-with",
            ["field", PRODUCTS.CATEGORY, null],
            "Gi",
          ],
        },
        aggregation: [["count"]],
        breakout: [["expression", expressionName]],
      },
    };

    it("should be able to add a post-aggregation filter", () => {
      createQuestion(questionDetails, { visitQuestion: true });
      assertQueryBuilderRowCount(2);
      tableHeaderClick(expressionName);
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByLabelText("True").click();
        cy.findByText("Add filter").click();
      });
      assertQueryBuilderRowCount(1);
    });
  });

  describe("source card", () => {
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [expressionName]: [
            "starts-with",
            ["field", PRODUCTS.CATEGORY, null],
            "Gi",
          ],
        },
      },
    };

    function getNestedQuestionDetails(
      cardId: number,
    ): StructuredQuestionDetails {
      return {
        query: {
          "source-table": `card__${cardId}`,
        },
      };
    }

    it("should be able to add a source column filter", () => {
      createQuestion(questionDetails).then(({ body: card }) =>
        createQuestion(getNestedQuestionDetails(card.id), {
          visitQuestion: true,
        }),
      );
      assertQueryBuilderRowCount(200);
      tableHeaderClick(expressionName);
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByLabelText("True").click();
        cy.findByText("Add filter").click();
      });
      assertQueryBuilderRowCount(51);
    });
  });
});

import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId, DashboardParameterMapping } from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE, PRODUCTS_ID, PRODUCTS } =
  SAMPLE_DATABASE;

describe("scenarios > custom column > boolean functions", () => {
  const expressionName = "Boolean column";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  describe("expression editor", () => {
    const stringQuestionColumns = ["Category"];
    const stringQuestionDetails: H.StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.CATEGORY, null]],
        "order-by": [["asc", ["field", PRODUCTS.ID, null]]],
        limit: 1,
      },
    };

    const numberQuestionColumns = ["Total"];
    const numberQuestionDetails: H.StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.TOTAL, null]],
        "order-by": [["asc", ["field", ORDERS.ID, null]]],
        limit: 1,
      },
    };

    const dateQuestionColumns = ["Created At"];
    const dateQuestionDetails: H.StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.CREATED_AT, null]],
        "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]]],
        limit: 1,
      },
    };

    function testExpression({
      questionDetails,
      questionColumns,
      newExpression,
      newExpressionRows,
      modifiedExpression,
      modifiedExpressionRows,
    }: {
      questionDetails: H.StructuredQuestionDetails;
      questionColumns: string[];
      newExpression: string;
      newExpressionRows: string[][];
      modifiedExpression: string;
      modifiedExpressionRows: string[][];
    }) {
      H.createQuestion(questionDetails, { visitQuestion: true });

      cy.log("add a new custom column");
      H.openNotebook();
      H.getNotebookStep("data").button("Custom column").click();
      H.enterCustomColumnDetails({
        formula: newExpression,
        name: expressionName,
      });
      H.popover().button("Done").click();
      H.visualize();
      cy.wait("@dataset");
      H.assertTableData({
        columns: [...questionColumns, expressionName],
        firstRows: newExpressionRows,
      });

      cy.log("modify an existing custom column");
      H.openNotebook();
      H.getNotebookStep("expression").findByText(expressionName).click();
      H.enterCustomColumnDetails({
        formula: modifiedExpression,
        name: expressionName,
      });
      H.popover().button("Update").click();
      H.visualize();
      cy.wait("@dataset");
      H.assertTableData({
        columns: [...questionColumns, expressionName],
        firstRows: modifiedExpressionRows,
      });

      cy.log("assert that the question can be saved");
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      cy.wait("@updateCard");
      H.queryBuilderHeader().button("Save").should("not.exist");
    }

    it("isNull", () => {
      testExpression({
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: "isNull([Category])",
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: "notNull([Category])",
        modifiedExpressionRows: [["Gizmo", "true"]],
      });
    });

    it("isEmpty", () => {
      testExpression({
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: "isEmpty([Category])",
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: "notEmpty([Category])",
        modifiedExpressionRows: [["Gizmo", "true"]],
      });
    });

    it("startsWith", () => {
      testExpression({
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'startsWith([Category], "Gi")',
        newExpressionRows: [["Gizmo", "true"]],
        modifiedExpression: 'startsWith([Category], "mo")',
        modifiedExpressionRows: [["Gizmo", "false"]],
      });
    });

    it("endsWith", () => {
      testExpression({
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'endsWith([Category], "Gi")',
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: 'endsWith([Category], "mo")',
        modifiedExpressionRows: [["Gizmo", "true"]],
      });
    });

    it("contains", () => {
      testExpression({
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'contains([Category], "zm")',
        newExpressionRows: [["Gizmo", "true"]],
        modifiedExpression: 'contains([Category], "mz")',
        modifiedExpressionRows: [["Gizmo", "false"]],
      });
    });

    it("doesNotContain", () => {
      testExpression({
        questionDetails: stringQuestionDetails,
        questionColumns: stringQuestionColumns,
        newExpression: 'doesNotContain([Category], "zm")',
        newExpressionRows: [["Gizmo", "false"]],
        modifiedExpression: 'doesNotContain([Category], "mz")',
        modifiedExpressionRows: [["Gizmo", "true"]],
      });
    });

    it("between", () => {
      testExpression({
        questionDetails: numberQuestionDetails,
        questionColumns: numberQuestionColumns,
        newExpression: "between([Total], 20, 30)",
        newExpressionRows: [["39.72", "false"]],
        modifiedExpression: "between([Total], 30, 40)",
        modifiedExpressionRows: [["39.72", "true"]],
      });
    });

    it("timeInterval", () => {
      testExpression({
        questionDetails: dateQuestionDetails,
        questionColumns: dateQuestionColumns,
        newExpression: 'interval([Created At], -30, "year")',
        newExpressionRows: [["April 30, 2022, 6:56 PM", "true"]],
        modifiedExpression: 'interval([Created At], 2, "month")',
        modifiedExpressionRows: [["April 30, 2022, 6:56 PM", "false"]],
      });
    });
  });

  describe("query builder", () => {
    describe("same stage", () => {
      const questionDetails: H.StructuredQuestionDetails = {
        query: {
          "source-table": PRODUCTS_ID,
          fields: [
            ["field", PRODUCTS.CATEGORY, null],
            ["expression", expressionName, { "base-type": "type/Boolean" }],
          ],
          expressions: {
            [expressionName]: [
              "starts-with",
              ["field", PRODUCTS.CATEGORY, null],
              "Gi",
            ],
          },
        },
      };

      it("should be able to add a same-stage custom column", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.openNotebook();

        cy.log("add an identity column");
        H.getNotebookStep("expression").icon("add").click();
        H.enterCustomColumnDetails({
          formula: `[${expressionName}]`,
          name: "Identity column",
        });
        H.popover().button("Done").click();

        cy.log("add a simple expression");
        H.getNotebookStep("expression").icon("add").click();
        H.enterCustomColumnDetails({
          formula: `[${expressionName}] != True`,
          name: "Simple expression",
        });
        H.popover().button("Done").click();

        cy.log("assert query results");
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [
            "Category",
            expressionName,
            "Identity column",
            "Simple expression",
          ],
          firstRows: [["Gizmo", "true", "true", "false"]],
        });
      });

      it("should be able to add a same-stage filter", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.assertQueryBuilderRowCount(200);
        H.tableHeaderClick(expressionName);
        H.popover().within(() => {
          cy.findByText("Filter by this column").click();
          cy.findByLabelText("True").click();
          cy.findByText("Add filter").click();
        });
        H.assertQueryBuilderRowCount(51);
      });

      it("should be able to add a same-stage aggregation", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.openNotebook();
        H.getNotebookStep("expression").button("Summarize").click();
        H.popover().findByText("Minimum of ...").click();
        H.popover().findByText(expressionName).click();
        H.getNotebookStep("summarize")
          .findByTestId("aggregate-step")
          .icon("add")
          .click();
        H.popover().findByText("Maximum of ...").click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [`Min of ${expressionName}`, `Max of ${expressionName}`],
          firstRows: [["false", "true"]],
        });
      });

      it("should be able to add a same-stage breakout", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.openNotebook();
        H.getNotebookStep("expression").button("Summarize").click();
        H.popover().findByText("Count of rows").click();
        H.getNotebookStep("summarize")
          .findByTestId("breakout-step")
          .findByText("Pick a column to group by")
          .click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [expressionName, "Count"],
          firstRows: [
            ["false", "149"],
            ["true", "51"],
          ],
        });
      });

      it("should be able to add a same-stage sorting", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.openNotebook();
        H.getNotebookStep("expression").button("Sort").click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: ["Category", expressionName],
          firstRows: [["Doohickey", "false"]],
        });
      });
    });

    describe("previous stage", () => {
      const questionDetails: H.StructuredQuestionDetails = {
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
          breakout: [
            ["expression", expressionName, { "base-type": "type/Boolean" }],
          ],
        },
      };

      it("should be able to add a post-aggregation custom column", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.openNotebook();
        H.getNotebookStep("summarize").button("Custom column").click();
        H.enterCustomColumnDetails({
          formula: `not([${expressionName}])`,
          name: "Simple expression",
        });
        H.popover().button("Done").click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [expressionName, "Count", "Simple expression"],
          firstRows: [
            ["false", "149", "true"],
            ["true", "51", "false"],
          ],
        });
      });

      it("should be able to add a post-aggregation filter", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.assertQueryBuilderRowCount(2);
        H.tableHeaderClick(expressionName);
        H.popover().within(() => {
          cy.findByText("Filter by this column").click();
          cy.findByLabelText("True").click();
          cy.findByText("Add filter").click();
        });
        H.assertQueryBuilderRowCount(1);
      });

      it("should be able to add a post-aggregation aggregation", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });
        H.openNotebook();
        H.getNotebookStep("summarize").button("Summarize").click();
        H.popover().findByText("Minimum of ...").click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [`Min of ${expressionName}`],
          firstRows: [["false"]],
        });
      });

      it("should be able to add a post-aggregation breakout and sorting", () => {
        H.createQuestion(questionDetails, { visitQuestion: true });

        cy.log("add a breakout");
        H.openNotebook();
        H.getNotebookStep("summarize").button("Summarize").click();
        H.popover().findByText("Count of rows").click();
        H.getNotebookStep("summarize", { stage: 1 })
          .findByTestId("breakout-step")
          .findByText("Pick a column to group by")
          .click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [expressionName, "Count"],
          firstRows: [
            ["false", 1],
            ["true", 1],
          ],
        });

        cy.log("add sorting");
        H.openNotebook();
        H.getNotebookStep("summarize", { stage: 1 }).button("Sort").click();
        H.popover().findByText(expressionName).click();
        H.getNotebookStep("sort", { stage: 1 }).icon("arrow_up").click();
        H.visualize();
        H.assertTableData({
          columns: [expressionName, "Count"],
          firstRows: [
            ["true", 1],
            ["false", 1],
          ],
        });
      });
    });

    describe("source card", () => {
      const questionDetails: H.StructuredQuestionDetails = {
        name: "Source",
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
      ): H.StructuredQuestionDetails {
        return {
          name: "Nested",
          query: {
            "source-table": `card__${cardId}`,
          },
        };
      }

      it("should be able to add a custom column for a boolean column", () => {
        H.createQuestion(questionDetails).then(({ body: card }) =>
          H.createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );

        cy.log("add a custom column");
        H.openNotebook();
        H.getNotebookStep("data").button("Custom column").click();
        H.enterCustomColumnDetails({
          formula: `[${expressionName}] != True`,
          name: "Simple expression",
        });
        H.popover().button("Done").click();
        H.visualize();
        cy.wait("@dataset");
        H.assertQueryBuilderRowCount(200);

        cy.log("use the new custom column in a filter");
        H.tableHeaderClick("Simple expression");
        H.popover().within(() => {
          cy.findByText("Filter by this column").click();
          cy.findByLabelText("True").click();
          cy.findByText("Add filter").click();
        });
        H.assertQueryBuilderRowCount(149);
      });

      it("should be able to add a filter for a boolean column", () => {
        H.createQuestion(questionDetails).then(({ body: card }) =>
          H.createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );
        H.assertQueryBuilderRowCount(200);
        H.tableHeaderClick(expressionName);
        H.popover().within(() => {
          cy.findByText("Filter by this column").click();
          cy.findByLabelText("True").click();
          cy.findByText("Add filter").click();
        });
        H.assertQueryBuilderRowCount(51);
      });

      it("should be able to add an aggregation for a boolean column", () => {
        H.createQuestion(questionDetails).then(({ body: card }) =>
          H.createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );
        H.openNotebook();
        H.getNotebookStep("data").button("Summarize").click();
        H.popover().findByText("Minimum of ...").click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [`Min of ${expressionName}`],
          firstRows: [["false"]],
        });
      });

      it.skip("should be able to add a breakout and sorting for a boolean column (metabase#49305)", () => {
        H.createQuestion(questionDetails).then(({ body: card }) =>
          H.createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );

        cy.log("add a breakout");
        H.openNotebook();
        H.getNotebookStep("data").button("Summarize").click();
        H.getNotebookStep("summarize")
          .findByTestId("breakout-step")
          .findByText("Pick a column to group by")
          .click();
        H.popover().findByText(expressionName).click();
        H.visualize();
        cy.wait("@dataset");
        H.assertTableData({
          columns: [expressionName],
          firstRows: [["false"], ["true"]],
        });

        cy.log("add sorting");
        H.openNotebook();
        H.getNotebookStep("summarize").button("Sort").click();
        H.popover().findByText(expressionName).click();
        H.getNotebookStep("sort").icon("arrow_up").click();
        H.visualize();
        H.assertTableData({
          columns: [expressionName],
          firstRows: [["true"], ["false"]],
        });
      });
    });
  });

  describe("dashboards", () => {
    const questionDetails: H.StructuredQuestionDetails = {
      name: "Q1",
      query: {
        "source-table": PEOPLE_ID,
        fields: [
          ["field", PEOPLE.NAME, { "base-type": "type/Text" }],
          ["expression", expressionName, { "base-type": "type/Boolean" }],
        ],
        expressions: {
          [expressionName]: [
            "starts-with",
            ["field", PEOPLE.NAME, null],
            "Sydney",
          ],
        },
      },
    };

    const parameterDetails = {
      name: "City",
      slug: "city",
      id: "27454068",
      type: "string/contains",
      sectionId: "string",
    };

    const dashboardDetails: H.DashboardDetails = {
      name: "D1",
      parameters: [parameterDetails],
    };

    function getParameterMapping(cardId: CardId): DashboardParameterMapping {
      return {
        card_id: cardId,
        parameter_id: parameterDetails.id,
        target: [
          "dimension",
          ["field", PEOPLE.CITY, { "base-type": "type/Text" }],
        ],
      };
    }

    function createDashboardWithQuestion(opts?: H.DashboardDetails) {
      return H.createDashboard({ ...dashboardDetails, ...opts }).then(
        ({ body: dashboard }) => {
          return H.createQuestion(questionDetails).then(({ body: card }) => {
            return cy
              .request("PUT", `/api/dashboard/${dashboard.id}`, {
                dashcards: [
                  createMockDashboardCard({
                    card_id: card.id,
                    parameter_mappings: [getParameterMapping(card.id)],
                    size_x: 8,
                    size_y: 8,
                  }),
                ],
              })
              .then(() => dashboard);
          });
        },
      );
    }

    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should be able setup an 'open question' click behavior", () => {
      createDashboardWithQuestion().then(dashboard =>
        H.visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior");
      H.editDashboard();
      H.showDashboardCardActions();
      H.getDashboardCard().findByLabelText("Click behavior").click();
      H.sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Questions").click();
        cy.findByText("Q1").click();
      });
      H.sidebar()
        .findByTestId("click-mappings")
        .findByText(expressionName)
        .click();
      H.popover().findByText(expressionName).click();
      H.saveDashboard();

      cy.log("verify click behavior");
      H.getDashboardCard().findAllByText("false").first().click();
      cy.wait("@dataset");
      cy.findByTestId("qb-filters-panel")
        .findByText(`${expressionName} is false`)
        .should("be.visible");
    });

    it("should be able setup an 'open dashboard' click behavior for the same dashboard", () => {
      createDashboardWithQuestion().then(dashboard =>
        H.visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior");
      H.editDashboard();
      H.showDashboardCardActions();
      H.getDashboardCard().findByLabelText("Click behavior").click();
      H.sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Dashboards").click();
        cy.findByText("D1").click();
      });
      H.sidebar()
        .findByTestId("click-mappings")
        .findByText(parameterDetails.name)
        .click();
      H.popover().findByText(expressionName).click();
      H.saveDashboard();

      cy.log("verify click behavior");
      H.getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("be.visible");
        cy.findByText("Sydney Rempel").should("not.exist");
        cy.findAllByText("false").first().click();
      });
      H.getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("not.exist");
        cy.findByText("Sydney Rempel").should("be.visible");
      });
    });

    it("should be able setup an 'open dashboard' click behavior for another dashboard", () => {
      createDashboardWithQuestion({ name: "D2" });
      createDashboardWithQuestion({ name: "D1" }).then(dashboard =>
        H.visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior");
      H.editDashboard();
      H.showDashboardCardActions();
      H.getDashboardCard().findByLabelText("Click behavior").click();
      H.sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Dashboards").click();
        cy.findByText("D2").click();
      });
      H.sidebar()
        .findByTestId("click-mappings")
        .findByText(parameterDetails.name)
        .click();
      H.popover().findByText(expressionName).click();
      H.saveDashboard();

      cy.log("verify click behavior");
      H.getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("be.visible");
        cy.findByText("Sydney Rempel").should("not.exist");
        cy.findAllByText("false").first().click();
      });
      cy.findByTestId("dashboard-name-heading").should("have.value", "D2");
      H.getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("not.exist");
        cy.findByText("Sydney Rempel").should("be.visible");
      });
    });
  });
});

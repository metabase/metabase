import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type DashboardDetails,
  type StructuredQuestionDetails,
  assertQueryBuilderRowCount,
  assertTableData,
  createDashboard,
  createQuestion,
  editDashboard,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  getDashboardCard,
  getNotebookStep,
  modal,
  openNotebook,
  popover,
  queryBuilderHeader,
  restore,
  saveDashboard,
  showDashboardCardActions,
  sidebar,
  tableHeaderClick,
  visitDashboard,
  visualize,
} from "e2e/support/helpers";
import type { CardId, DashboardParameterMapping } from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE, PRODUCTS_ID, PRODUCTS } =
  SAMPLE_DATABASE;

describe("scenarios > custom column > boolean functions", () => {
  const expressionName = "Boolean column";

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  describe("expression editor", () => {
    const stringQuestionColumns = ["Category"];
    const stringQuestionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [["field", PRODUCTS.CATEGORY, null]],
        "order-by": [["asc", ["field", PRODUCTS.ID, null]]],
        limit: 1,
      },
    };

    const numberQuestionColumns = ["Total"];
    const numberQuestionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        fields: [["field", ORDERS.TOTAL, null]],
        "order-by": [["asc", ["field", ORDERS.ID, null]]],
        limit: 1,
      },
    };

    const dateQuestionColumns = ["Created At"];
    const dateQuestionDetails: StructuredQuestionDetails = {
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
      questionDetails: StructuredQuestionDetails;
      questionColumns: string[];
      newExpression: string;
      newExpressionRows: string[][];
      modifiedExpression: string;
      modifiedExpressionRows: string[][];
    }) {
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

      cy.log("assert that the question can be saved");
      queryBuilderHeader().button("Save").click();
      modal().button("Save").click();
      cy.wait("@updateCard");
      queryBuilderHeader().button("Save").should("not.exist");
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
      const questionDetails: StructuredQuestionDetails = {
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
        createQuestion(questionDetails, { visitQuestion: true });
        openNotebook();

        cy.log("add an identity column");
        getNotebookStep("expression").icon("add").click();
        enterCustomColumnDetails({
          formula: `[${expressionName}]`,
          name: "Identity column",
        });
        popover().button("Done").click();

        cy.log("add a simple expression");
        getNotebookStep("expression").icon("add").click();
        enterCustomColumnDetails({
          formula: `[${expressionName}] != True`,
          name: "Simple expression",
        });
        popover().button("Done").click();

        cy.log("assert query results");
        visualize();
        cy.wait("@dataset");
        assertTableData({
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

      it("should be able to add a same-stage aggregation", () => {
        createQuestion(questionDetails, { visitQuestion: true });
        openNotebook();
        getNotebookStep("expression").button("Summarize").click();
        popover().findByText("Minimum of ...").click();
        popover().findByText(expressionName).click();
        getNotebookStep("summarize")
          .findByTestId("aggregate-step")
          .icon("add")
          .click();
        popover().findByText("Maximum of ...").click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [`Min of ${expressionName}`, `Max of ${expressionName}`],
          firstRows: [["false", "true"]],
        });
      });

      it("should be able to add a same-stage breakout", () => {
        createQuestion(questionDetails, { visitQuestion: true });
        openNotebook();
        getNotebookStep("expression").button("Summarize").click();
        popover().findByText("Count of rows").click();
        getNotebookStep("summarize")
          .findByTestId("breakout-step")
          .findByText("Pick a column to group by")
          .click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [expressionName, "Count"],
          firstRows: [
            ["false", "149"],
            ["true", "51"],
          ],
        });
      });

      it("should be able to add a same-stage sorting", () => {
        createQuestion(questionDetails, { visitQuestion: true });
        openNotebook();
        getNotebookStep("expression").button("Sort").click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: ["Category", expressionName],
          firstRows: [["Doohickey", "false"]],
        });
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
          breakout: [
            ["expression", expressionName, { "base-type": "type/Boolean" }],
          ],
        },
      };

      it("should be able to add a post-aggregation custom column", () => {
        createQuestion(questionDetails, { visitQuestion: true });
        openNotebook();
        getNotebookStep("summarize").button("Custom column").click();
        enterCustomColumnDetails({
          formula: `not([${expressionName}])`,
          name: "Simple expression",
        });
        popover().button("Done").click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [expressionName, "Count", "Simple expression"],
          firstRows: [
            ["false", "149", "true"],
            ["true", "51", "false"],
          ],
        });
      });

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

      it("should be able to add a post-aggregation aggregation", () => {
        createQuestion(questionDetails, { visitQuestion: true });
        openNotebook();
        getNotebookStep("summarize").button("Summarize").click();
        popover().findByText("Minimum of ...").click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [`Min of ${expressionName}`],
          firstRows: [["false"]],
        });
      });

      it("should be able to add a post-aggregation breakout and sorting", () => {
        createQuestion(questionDetails, { visitQuestion: true });

        cy.log("add a breakout");
        openNotebook();
        getNotebookStep("summarize").button("Summarize").click();
        popover().findByText("Count of rows").click();
        getNotebookStep("summarize", { stage: 1 })
          .findByTestId("breakout-step")
          .findByText("Pick a column to group by")
          .click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [expressionName, "Count"],
          firstRows: [
            ["false", 1],
            ["true", 1],
          ],
        });

        cy.log("add sorting");
        openNotebook();
        getNotebookStep("summarize", { stage: 1 }).button("Sort").click();
        popover().findByText(expressionName).click();
        getNotebookStep("sort", { stage: 1 }).icon("arrow_up").click();
        visualize();
        assertTableData({
          columns: [expressionName, "Count"],
          firstRows: [
            ["true", 1],
            ["false", 1],
          ],
        });
      });
    });

    describe("source card", () => {
      const questionDetails: StructuredQuestionDetails = {
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
      ): StructuredQuestionDetails {
        return {
          name: "Nested",
          query: {
            "source-table": `card__${cardId}`,
          },
        };
      }

      it("should be able to add a custom column for a boolean column", () => {
        createQuestion(questionDetails).then(({ body: card }) =>
          createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );

        cy.log("add a custom column");
        openNotebook();
        getNotebookStep("data").button("Custom column").click();
        enterCustomColumnDetails({
          formula: `[${expressionName}] != True`,
          name: "Simple expression",
        });
        popover().button("Done").click();
        visualize();
        cy.wait("@dataset");
        assertQueryBuilderRowCount(200);

        cy.log("use the new custom column in a filter");
        tableHeaderClick("Simple expression");
        popover().within(() => {
          cy.findByText("Filter by this column").click();
          cy.findByLabelText("True").click();
          cy.findByText("Add filter").click();
        });
        assertQueryBuilderRowCount(149);
      });

      it("should be able to add a filter for a boolean column", () => {
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

      it("should be able to add an aggregation for a boolean column", () => {
        createQuestion(questionDetails).then(({ body: card }) =>
          createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );
        openNotebook();
        getNotebookStep("data").button("Summarize").click();
        popover().findByText("Minimum of ...").click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [`Min of ${expressionName}`],
          firstRows: [["false"]],
        });
      });

      it.skip("should be able to add a breakout and sorting for a boolean column (metabase#49305)", () => {
        createQuestion(questionDetails).then(({ body: card }) =>
          createQuestion(getNestedQuestionDetails(card.id), {
            visitQuestion: true,
          }),
        );

        cy.log("add a breakout");
        openNotebook();
        getNotebookStep("data").button("Summarize").click();
        getNotebookStep("summarize")
          .findByTestId("breakout-step")
          .findByText("Pick a column to group by")
          .click();
        popover().findByText(expressionName).click();
        visualize();
        cy.wait("@dataset");
        assertTableData({
          columns: [expressionName],
          firstRows: [["false"], ["true"]],
        });

        cy.log("add sorting");
        openNotebook();
        getNotebookStep("summarize").button("Sort").click();
        popover().findByText(expressionName).click();
        getNotebookStep("sort").icon("arrow_up").click();
        visualize();
        assertTableData({
          columns: [expressionName],
          firstRows: [["true"], ["false"]],
        });
      });
    });
  });

  describe("dashboards", () => {
    const questionDetails: StructuredQuestionDetails = {
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

    const dashboardDetails: DashboardDetails = {
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

    function createDashboardWithQuestion(opts?: DashboardDetails) {
      return createDashboard({ ...dashboardDetails, ...opts }).then(
        ({ body: dashboard }) => {
          return createQuestion(questionDetails).then(({ body: card }) => {
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
        visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior");
      editDashboard();
      showDashboardCardActions();
      getDashboardCard().findByLabelText("Click behavior").click();
      sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      entityPickerModal().within(() => {
        entityPickerModalTab("Questions").click();
        cy.findByText("Q1").click();
      });
      sidebar()
        .findByTestId("click-mappings")
        .findByText(expressionName)
        .click();
      popover().findByText(expressionName).click();
      saveDashboard();

      cy.log("verify click behavior");
      getDashboardCard().findAllByText("false").first().click();
      cy.wait("@dataset");
      cy.findByTestId("qb-filters-panel")
        .findByText(`${expressionName} is false`)
        .should("be.visible");
    });

    it("should be able setup an 'open dashboard' click behavior for the same dashboard", () => {
      createDashboardWithQuestion().then(dashboard =>
        visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior");
      editDashboard();
      showDashboardCardActions();
      getDashboardCard().findByLabelText("Click behavior").click();
      sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      entityPickerModal().within(() => {
        entityPickerModalTab("Dashboards").click();
        cy.findByText("D1").click();
      });
      sidebar()
        .findByTestId("click-mappings")
        .findByText(parameterDetails.name)
        .click();
      popover().findByText(expressionName).click();
      saveDashboard();

      cy.log("verify click behavior");
      getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("be.visible");
        cy.findByText("Sydney Rempel").should("not.exist");
        cy.findAllByText("false").first().click();
      });
      getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("not.exist");
        cy.findByText("Sydney Rempel").should("be.visible");
      });
    });

    it("should be able setup an 'open dashboard' click behavior for another dashboard", () => {
      createDashboardWithQuestion({ name: "D2" });
      createDashboardWithQuestion({ name: "D1" }).then(dashboard =>
        visitDashboard(dashboard.id),
      );

      cy.log("setup click behavior");
      editDashboard();
      showDashboardCardActions();
      getDashboardCard().findByLabelText("Click behavior").click();
      sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      entityPickerModal().within(() => {
        entityPickerModalTab("Dashboards").click();
        cy.findByText("D2").click();
      });
      sidebar()
        .findByTestId("click-mappings")
        .findByText(parameterDetails.name)
        .click();
      popover().findByText(expressionName).click();
      saveDashboard();

      cy.log("verify click behavior");
      getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("be.visible");
        cy.findByText("Sydney Rempel").should("not.exist");
        cy.findAllByText("false").first().click();
      });
      cy.findByTestId("dashboard-name-heading").should("have.value", "D2");
      getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("not.exist");
        cy.findByText("Sydney Rempel").should("be.visible");
      });
    });
  });
});

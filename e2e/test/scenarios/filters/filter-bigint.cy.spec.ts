import type { Sheet } from "xlsx";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type {
  DashboardDetails,
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type {
  CardId,
  DashboardParameterMapping,
  Parameter,
  Table,
  TableId,
  VisualizationSettings,
} from "metabase-types/api";

const { H } = cy;

const BIGINT_PK_TABLE_NAME = "bigint_pk_table";
const DECIMAL_PK_TABLE_NAME = "decimal_pk_table";

const MIN_BIGINT_VALUE = "-9223372036854775808";
const FORMATTED_MIN_BIGINT_VALUE = "-9,223,372,036,854,775,808";
const MAX_BIGINT_VALUE = "9223372036854775807";
const FORMATTED_MAX_BIGINT_VALUE = "9,223,372,036,854,775,807";

const NEGATIVE_DECIMAL_VALUE = "-9223372036854775809";
const FORMATTED_NEGATIVE_DECIMAL_VALUE = "-9,223,372,036,854,775,809";
const POSITIVE_DECIMAL_VALUE = "9223372036854775808";
const FORMATTED_POSITIVE_DECIMAL_VALUE = "9,223,372,036,854,775,808";

describe("scenarios > filters > bigint (metabase#5816)", () => {
  const bigIntQuestionDetails: NativeQuestionDetails = {
    name: "SQL NUMBER",
    native: {
      query: `SELECT ${MIN_BIGINT_VALUE} AS NUMBER
UNION ALL
SELECT 0 AS NUMBER
UNION ALL
SELECT ${MAX_BIGINT_VALUE} AS NUMBER`,
      "template-tags": {},
    },
    display: "table",
  };

  const decimalQuestionDetails: NativeQuestionDetails = {
    name: "SQL NUMBER",
    native: {
      query: `SELECT CAST('${NEGATIVE_DECIMAL_VALUE}' AS DECIMAL) AS NUMBER
UNION ALL
SELECT CAST(0 AS DECIMAL) AS NUMBER
UNION ALL
SELECT CAST('${POSITIVE_DECIMAL_VALUE}' AS DECIMAL) AS NUMBER`,
      "template-tags": {},
    },
    display: "table",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("query builder + mbql query", () => {
    function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const getTargetQuestionDetails = (
        cardId: CardId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        query: {
          "source-table": `card__${cardId}`,
        },
        display: "table",
      });

      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createQuestion(getTargetQuestionDetails(card.id), {
          visitQuestion: true,
        });
        H.openNotebook();
      });
    }

    function testFilter({
      filterOperator,
      setFilterValue,
      filterDisplayName,
      filteredRowCount,
    }: {
      filterOperator: string;
      setFilterValue: () => void;
      filterDisplayName: string;
      filteredRowCount: number;
    }) {
      cy.log("add a filter");
      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("NUMBER").click();
        cy.findByLabelText("Filter operator").click();
      });
      H.popover().eq(1).findByText(filterOperator).click();
      H.popover().within(() => {
        setFilterValue();
        cy.button("Add filter").click();
      });
      H.getNotebookStep("filter")
        .findByText(filterDisplayName)
        .should("be.visible");
      H.visualize();
      H.assertQueryBuilderRowCount(filteredRowCount);

      cy.log("remove the filter");
      H.openNotebook();
      H.getNotebookStep("filter")
        .findByText(filterDisplayName)
        .icon("close")
        .click();
    }

    function testFilters({
      sourceQuestionDetails,
      minValue,
      maxValue,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      minValue: string;
      maxValue: string;
    }) {
      cy.log("setup");
      setupQuestion({ sourceQuestionDetails });

      cy.log("= operator");
      testFilter({
        filterOperator: "Equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is equal to ${maxValue}`,
        filteredRowCount: 1,
      });

      cy.log("!= operator");
      testFilter({
        filterOperator: "Not equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is not equal to ${minValue}`,
        filteredRowCount: 2,
      });

      cy.log("> operator");
      testFilter({
        filterOperator: "Greater than",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is greater than ${minValue}`,
        filteredRowCount: 2,
      });

      cy.log(">= operator");
      testFilter({
        filterOperator: "Greater than or equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is greater than or equal to ${minValue}`,
        filteredRowCount: 3,
      });

      cy.log("< operator");
      testFilter({
        filterOperator: "Less than",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is less than ${maxValue}`,
        filteredRowCount: 2,
      });

      cy.log("<= operator");
      testFilter({
        filterOperator: "Less than or equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is less than or equal to ${maxValue}`,
        filteredRowCount: 3,
      });

      cy.log("between operator - min value");
      testFilter({
        filterOperator: "Between",
        setFilterValue: () => {
          cy.findByPlaceholderText("Min").type(minValue);
          cy.findByPlaceholderText("Max").type("0");
        },
        filterDisplayName: `NUMBER is between ${minValue} and 0`,
        filteredRowCount: 2,
      });

      cy.log("between operator - max value");
      testFilter({
        filterOperator: "Between",
        setFilterValue: () => {
          cy.findByPlaceholderText("Min").type("0");
          cy.findByPlaceholderText("Max").type(maxValue);
        },
        filterDisplayName: `NUMBER is between 0 and ${maxValue}`,
        filteredRowCount: 2,
      });

      cy.log("between operator - min and max values");
      testFilter({
        filterOperator: "Between",
        setFilterValue: () => {
          cy.findByPlaceholderText("Min").type(minValue);
          cy.findByPlaceholderText("Max").type(maxValue);
        },
        filterDisplayName: `NUMBER is between ${minValue} and ${maxValue}`,
        filteredRowCount: 3,
      });
    }

    cy.log("BIGINT");
    testFilters({
      sourceQuestionDetails: bigIntQuestionDetails,
      minValue: MIN_BIGINT_VALUE,
      maxValue: MAX_BIGINT_VALUE,
    });

    cy.log("DECIMAL");
    testFilters({
      sourceQuestionDetails: decimalQuestionDetails,
      minValue: NEGATIVE_DECIMAL_VALUE,
      maxValue: POSITIVE_DECIMAL_VALUE,
    });
  });

  it("dashboards + mbql query + id parameters", { tags: "external" }, () => {
    function setupDashboard({
      tableName,
      baseType,
    }: {
      tableName: string;
      baseType: string;
    }) {
      const parameterDetails: Parameter = {
        id: "b6ed2d71",
        type: "id",
        name: "ID",
        slug: "id",
        sectionId: "id",
      };

      const dashboardDetails: DashboardDetails = {
        name: "Dashboard",
        parameters: [parameterDetails],
        enable_embedding: true,
        embedding_params: {
          [parameterDetails.slug]: "enabled",
        },
      };

      const getTargetQuestionDetails = (
        tableId: TableId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        database: WRITABLE_DB_ID,
        query: {
          "source-table": tableId,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      const getParameterMapping = (
        cardId: CardId,
        fieldId: number,
      ): DashboardParameterMapping => ({
        parameter_id: parameterDetails.id,
        card_id: cardId,
        target: ["dimension", ["field", fieldId, { "base-type": baseType }]],
      });

      getTableId(tableName).then((tableId) => {
        getFieldId(tableId, "id").then((fieldId) => {
          H.createQuestion(getTargetQuestionDetails(tableId)).then(
            ({ body: card }) => {
              H.createDashboard(dashboardDetails).then(
                ({ body: dashboard }) => {
                  H.addOrUpdateDashboardCard({
                    dashboard_id: dashboard.id,
                    card_id: card.id,
                    card: {
                      parameter_mappings: [
                        getParameterMapping(card.id, fieldId),
                      ],
                    },
                  });
                  cy.wrap(dashboard.id).as("dashboardId");
                  H.visitDashboard(dashboard.id);
                },
              );
            },
          );
        });
      });
    }

    function testFilter({
      value,
      withDrillThru,
    }: {
      value: string;
      withDrillThru?: boolean;
    }) {
      cy.log("add a filter");
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "3");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter an ID").type(value);
        cy.button("Add filter").click();
      });
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "1");

      if (withDrillThru) {
        cy.log("drill-thru");
        H.getDashboardCard().findByText("MBQL").click();
        H.queryBuilderFiltersPanel().findByText(`ID is ${value}`);
        H.queryBuilderMain()
          .findByTestId("scalar-value")
          .should("have.text", "1");
        H.queryBuilderHeader().findByLabelText("Back to Dashboard").click();
      }

      H.filterWidget().icon("close").click();
    }

    function testBigIntFilters({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      testFilter({ value: MIN_BIGINT_VALUE, withDrillThru });
      testFilter({ value: MAX_BIGINT_VALUE, withDrillThru });
    }

    function testDecimalFilters({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      testFilter({ value: NEGATIVE_DECIMAL_VALUE, withDrillThru });
      testFilter({ value: POSITIVE_DECIMAL_VALUE, withDrillThru });
    }

    cy.log("create tables");
    setupTables();

    cy.log("BIGINT");
    cy.signInAsAdmin();
    setupDashboard({
      tableName: BIGINT_PK_TABLE_NAME,
      baseType: "type/BigInteger",
    });
    testBigIntFilters({ withDrillThru: true });
    visitPublicDashboard();
    testBigIntFilters();
    visitEmbeddedDashboard();
    testBigIntFilters();

    cy.log("DECIMAL");
    cy.signInAsAdmin();
    setupDashboard({
      tableName: DECIMAL_PK_TABLE_NAME,
      baseType: "type/Decimal",
    });
    testDecimalFilters({ withDrillThru: true });
    visitPublicDashboard();
    testDecimalFilters();
    visitEmbeddedDashboard();
    testDecimalFilters();
  });

  it("dashboards + mbql query + number parameters", () => {
    function setupDashboard({
      sourceQuestionDetails,
      baseType,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      baseType: string;
    }) {
      const parameters: Parameter[] = [
        {
          id: "b6ed2d71",
          type: "number/=",
          name: "Equal to",
          slug: "equal-to",
          sectionId: "number",
        },
        {
          id: "b6ed2d72",
          type: "number/!=",
          name: "Not equal to",
          slug: "not-equal=to",
          sectionId: "number",
        },
        {
          id: "b6ed2d73",
          type: "number/>=",
          name: "Greater than or equal to",
          slug: "greater-than-or-equal-to",
          sectionId: "number",
        },
        {
          id: "b6ed2d74",
          type: "number/<=",
          name: "Less than or equal to",
          slug: "less-than-or-equal-to",
          sectionId: "number",
        },
        {
          id: "b6ed2d75",
          type: "number/between",
          name: "Between",
          slug: "between",
          sectionId: "number",
        },
      ];

      const dashboardDetails: DashboardDetails = {
        name: "Dashboard",
        parameters,
        enable_embedding: true,
        embedding_params: Object.fromEntries(
          parameters.map((parameter) => [parameter.slug, "enabled"]),
        ),
      };

      const getTargetQuestionDetails = (
        cardId: CardId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        query: {
          "source-table": `card__${cardId}`,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      const getParameterMapping = (
        parameterId: string,
        cardId: CardId,
      ): DashboardParameterMapping => ({
        parameter_id: parameterId,
        card_id: cardId,
        target: ["dimension", ["field", "NUMBER", { "base-type": baseType }]],
      });

      cy.signInAsAdmin();
      H.createNativeQuestion(sourceQuestionDetails).then(
        ({ body: sourceCard }) => {
          H.createQuestion(getTargetQuestionDetails(sourceCard.id)).then(
            ({ body: targetCard }) => {
              H.createDashboard(dashboardDetails).then(
                ({ body: dashboard }) => {
                  H.addOrUpdateDashboardCard({
                    dashboard_id: dashboard.id,
                    card_id: targetCard.id,
                    card: {
                      parameter_mappings: parameters.map((parameter) =>
                        getParameterMapping(parameter.id, targetCard.id),
                      ),
                    },
                  });
                  cy.wrap(dashboard.id).as("dashboardId");
                },
              );
            },
          );
        },
      );
    }

    function findFilterWidget(parameterName: string) {
      return H.filterWidget().filter(`:contains(${parameterName})`);
    }

    function testFilter({
      parameterName,
      setParameterValue,
      filterDisplayName,
      filterArgsDisplayName,
      filteredRowCount,
      withDrillThru,
    }: {
      parameterName: string;
      setParameterValue: () => void;
      filterDisplayName: string;
      filterArgsDisplayName: string;
      filteredRowCount: number;
      withDrillThru?: boolean;
    }) {
      cy.log("add a filter");
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "3");
      findFilterWidget(parameterName).click();
      H.popover().within(() => {
        setParameterValue();
        cy.button("Add filter").click();
      });
      findFilterWidget(parameterName)
        .findByText(filterArgsDisplayName)
        .should("be.visible");
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", String(filteredRowCount));

      if (withDrillThru) {
        cy.log("drill-thru");
        H.getDashboardCard().findByText("MBQL").click();
        H.queryBuilderFiltersPanel().findByText(filterDisplayName);
        H.queryBuilderMain()
          .findByTestId("scalar-value")
          .should("have.text", String(filteredRowCount));
        H.queryBuilderHeader().findByLabelText("Back to Dashboard").click();
      }

      findFilterWidget(parameterName).icon("close").click();
    }

    function testFilters({
      minValue,
      maxValue,
      formattedMinValue,
      formattedMaxValue,
      withDrillThru,
    }: {
      minValue: string;
      maxValue: string;
      formattedMinValue: string;
      formattedMaxValue: string;
      withDrillThru?: boolean;
    }) {
      cy.log("number/= parameter");
      testFilter({
        parameterName: "Equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(maxValue),
        filterDisplayName: `NUMBER is equal to ${maxValue}`,
        filterArgsDisplayName: formattedMaxValue,
        filteredRowCount: 1,
        withDrillThru,
      });

      cy.log("number/!= parameter");
      testFilter({
        parameterName: "Not equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(minValue),
        filterDisplayName: `NUMBER is not equal to ${minValue}`,
        filterArgsDisplayName: formattedMinValue,
        filteredRowCount: 2,
        withDrillThru,
      });

      cy.log("number/>= parameter");
      testFilter({
        parameterName: "Greater than or equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(minValue),
        filterDisplayName: `NUMBER is greater than or equal to ${minValue}`,
        filterArgsDisplayName: formattedMinValue,
        filteredRowCount: 3,
        withDrillThru,
      });

      cy.log("number/<= parameter");
      testFilter({
        parameterName: "Less than or equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(maxValue),
        filterDisplayName: `NUMBER is less than or equal to ${maxValue}`,
        filterArgsDisplayName: formattedMaxValue,
        filteredRowCount: 3,
        withDrillThru,
      });

      cy.log("number/between parameter - min value");
      testFilter({
        parameterName: "Between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type(minValue);
          cy.findAllByPlaceholderText("Enter a number").eq(1).type("0");
        },
        filterDisplayName: `NUMBER is between ${minValue} and 0`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 2,
        withDrillThru,
      });

      cy.log("number/between parameter - max value");
      testFilter({
        parameterName: "Between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
          cy.findAllByPlaceholderText("Enter a number").eq(1).type(maxValue);
        },
        filterDisplayName: `NUMBER is between 0 and ${maxValue}`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 2,
        withDrillThru,
      });

      cy.log("number/between parameter - min and max values");
      testFilter({
        parameterName: "Between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type(minValue);
          cy.findAllByPlaceholderText("Enter a number").eq(1).type(maxValue);
        },
        filterDisplayName: `NUMBER is between ${minValue} and ${maxValue}`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 3,
        withDrillThru,
      });
    }

    function testBigIntFilters({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      testFilters({
        minValue: MIN_BIGINT_VALUE,
        maxValue: MAX_BIGINT_VALUE,
        formattedMinValue: FORMATTED_MIN_BIGINT_VALUE,
        formattedMaxValue: FORMATTED_MAX_BIGINT_VALUE,
        withDrillThru,
      });
    }

    function testDecimalFilters({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      testFilters({
        minValue: NEGATIVE_DECIMAL_VALUE,
        maxValue: POSITIVE_DECIMAL_VALUE,
        formattedMinValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
        formattedMaxValue: FORMATTED_POSITIVE_DECIMAL_VALUE,
        withDrillThru,
      });
    }

    cy.log("BIGINT");
    cy.signInAsAdmin();
    setupDashboard({
      sourceQuestionDetails: bigIntQuestionDetails,
      baseType: "type/BigInteger",
    });
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");
    testBigIntFilters({ withDrillThru: true });
    visitPublicDashboard();
    testBigIntFilters();
    visitEmbeddedDashboard();
    testBigIntFilters();

    cy.log("DECIMAL");
    cy.signInAsAdmin();
    setupDashboard({
      sourceQuestionDetails: decimalQuestionDetails,
      baseType: "type/Decimal",
    });
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");
    testDecimalFilters({ withDrillThru: true });
    visitPublicDashboard();
    testDecimalFilters();
    visitEmbeddedDashboard();
    testDecimalFilters();
  });

  it("query builder + native query + variables", () => {
    function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const getTargetQuestionDetails = (
        cardId: CardId,
      ): NativeQuestionDetails => {
        const cardTagName = `#${cardId}-sql-number`;
        const cardTagDisplayName = `#${cardId} Sql Number`;

        const parameterDetails: Parameter = {
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          type: "number/=",
          target: ["variable", ["template-tag", "number"]],
          name: "Number",
          slug: "number",
        };

        return {
          name: "SQL",
          display: "scalar",
          native: {
            query: `SELECT COUNT(*) FROM {{#${cardId}-sql-number}} [[WHERE NUMBER = {{number}}]]`,
            "template-tags": {
              [cardTagName]: {
                id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
                name: cardTagName,
                "display-name": cardTagDisplayName,
                type: "card",
                "card-id": cardId,
              },
              number: {
                id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
                name: "number",
                "display-name": "Number",
                type: "number",
              },
            },
          },
          parameters: [parameterDetails],
          enable_embedding: true,
          embedding_params: {
            [parameterDetails.slug]: "enabled",
          },
        };
      };

      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createNativeQuestion(getTargetQuestionDetails(card.id), {
          wrapId: true,
        });
      });
    }

    function testFilter({
      value,
      withRunButton,
    }: {
      value: string;
      withRunButton?: boolean;
    }) {
      cy.log("add a filter");
      cy.findByTestId("scalar-value").should("have.text", "3");
      H.filterWidget().findByRole("textbox").type(value).blur();
      if (withRunButton) {
        cy.findAllByTestId("run-button").first().click();
      }
      H.filterWidget().findByRole("textbox").should("have.value", value);
      cy.findByTestId("scalar-value").should("have.text", "1");
    }

    function testBitIntFilter({
      withRunButton,
    }: { withRunButton?: boolean } = {}) {
      testFilter({ value: MAX_BIGINT_VALUE, withRunButton });
    }

    function testDecimalFilter({
      withRunButton,
    }: { withRunButton?: boolean } = {}) {
      testFilter({ value: NEGATIVE_DECIMAL_VALUE, withRunButton });
    }

    cy.log("BIGINT");
    cy.signInAsAdmin();
    setupQuestion({ sourceQuestionDetails: bigIntQuestionDetails });
    cy.signInAsNormalUser();
    H.visitQuestion("@questionId");
    testBitIntFilter({ withRunButton: true });
    visitPublicQuestion();
    testBitIntFilter();
    visitEmbeddedQuestion();
    testBitIntFilter();

    cy.log("DECIMAL");
    cy.signInAsAdmin();
    setupQuestion({ sourceQuestionDetails: decimalQuestionDetails });
    cy.signInAsNormalUser();
    H.visitQuestion("@questionId");
    testDecimalFilter({ withRunButton: true });
    visitPublicQuestion();
    testDecimalFilter();
    visitEmbeddedQuestion();
    testDecimalFilter();
  });

  it("dashboards + native query + variables", () => {
    function setupDashboard({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const parameterDetails: Parameter = {
        id: "b6ed2d71",
        type: "number/=",
        name: "Number",
        slug: "number",
        sectionId: "number",
      };

      const dashboardDetails: DashboardDetails = {
        name: "Dashboard",
        parameters: [parameterDetails],
        enable_embedding: true,
        embedding_params: {
          [parameterDetails.slug]: "enabled",
        },
      };

      const getTargetQuestionDetails = (
        cardId: CardId,
      ): NativeQuestionDetails => {
        const cardTagName = `#${cardId}-sql-number`;
        const cardTagDisplayName = `#${cardId} Sql Number`;

        return {
          name: "SQL",
          native: {
            query: `SELECT COUNT(*) FROM {{#${cardId}-sql-number}} [[WHERE NUMBER = {{number}}]]`,
            "template-tags": {
              [cardTagName]: {
                id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
                name: cardTagName,
                "display-name": cardTagDisplayName,
                type: "card",
                "card-id": cardId,
              },
              number: {
                id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
                name: "number",
                "display-name": "Number",
                type: "number",
              },
            },
          },
          display: "scalar",
        };
      };

      const getParameterMapping = (
        cardId: CardId,
      ): DashboardParameterMapping => ({
        card_id: cardId,
        parameter_id: parameterDetails.id,
        target: ["variable", ["template-tag", "number"]],
      });

      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createNativeQuestionAndDashboard({
          questionDetails: getTargetQuestionDetails(card.id),
          dashboardDetails,
        }).then(({ body: dashcard, questionId }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: questionId,
            card: {
              parameter_mappings: [getParameterMapping(questionId)],
            },
          });
          cy.wrap(dashcard.dashboard_id).as("dashboardId");
        });
      });
    }

    function testFilter({
      value,
      withDrillThru,
    }: {
      value: string;
      withDrillThru?: boolean;
    }) {
      cy.log("add a filter");
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "3");
      H.filterWidget().findByRole("textbox").type(value).blur();
      H.filterWidget().findByRole("textbox").should("have.value", value);
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "1");

      if (withDrillThru) {
        cy.log("drill-thru");
        H.getDashboardCard().findByText("SQL").click();
        H.queryBuilderMain()
          .findByTestId("scalar-value")
          .should("have.text", "1");
        H.filterWidget().findByRole("textbox").should("have.value", value);
        H.queryBuilderHeader().findByLabelText("Back to Dashboard").click();
      }

      H.filterWidget().icon("close").click();
    }

    function testBigIntFilter({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      testFilter({ value: MAX_BIGINT_VALUE, withDrillThru });
    }

    function testDecimalFilter({
      withDrillThru,
    }: { withDrillThru?: boolean } = {}) {
      testFilter({ value: POSITIVE_DECIMAL_VALUE, withDrillThru });
    }

    cy.log("BIGINT");
    cy.signInAsAdmin();
    setupDashboard({ sourceQuestionDetails: bigIntQuestionDetails });
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");
    testBigIntFilter({ withDrillThru: true });
    visitPublicDashboard();
    testBigIntFilter();
    visitEmbeddedDashboard();
    testBigIntFilter();

    cy.log("DECIMAL");
    cy.signInAsAdmin();
    setupDashboard({ sourceQuestionDetails: decimalQuestionDetails });
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");
    testDecimalFilter({ withDrillThru: true });
    visitPublicDashboard();
    testDecimalFilter();
    visitEmbeddedDashboard();
    testDecimalFilter();
  });

  it(
    "query builder + native query + field filters",
    { tags: "@external" },
    () => {
      function setupQuestion({
        tableName,
        baseType,
      }: {
        tableName: string;
        baseType: string;
      }) {
        getTableId(tableName).then((tableId) => {
          getFieldId(tableId, "id").then((fieldId) => {
            const parameterDetails: Parameter = {
              id: "0dcd2f82-2e7d-4989-9362-5c94744a6585",
              name: "ID",
              slug: "id",
              type: "id",
              target: ["dimension", ["template-tag", "id"]],
            };

            const questionDetails: NativeQuestionDetails = {
              name: "SQL",
              display: "scalar",
              database: WRITABLE_DB_ID,
              native: {
                query: `SELECT COUNT(*) FROM ${tableName} WHERE {{id}}`,
                "template-tags": {
                  id: {
                    id: parameterDetails.id,
                    name: "id",
                    "display-name": "ID",
                    type: "dimension",
                    dimension: ["field", fieldId, { "base-type": baseType }],
                    "widget-type": "id",
                  },
                },
              },
              parameters: [parameterDetails],
              enable_embedding: true,
              embedding_params: {
                [parameterDetails.slug]: "enabled",
              },
            };
            H.createNativeQuestion(questionDetails, { wrapId: true });
          });
        });
      }

      function testFilter({
        value,
        withRunButton,
      }: {
        value: string;
        withRunButton?: boolean;
      }) {
        cy.log("add a filter");
        cy.findByTestId("scalar-value").should("have.text", "3");
        H.filterWidget().click();
        H.popover().within(() => {
          cy.findByPlaceholderText("Enter an ID").type(value);
          cy.button("Add filter").click();
        });
        if (withRunButton) {
          cy.findAllByTestId("run-button").first().click();
        }
        cy.findByTestId("scalar-value").should("have.text", "1");
      }

      function testBitIntFilter({
        withRunButton,
      }: { withRunButton?: boolean } = {}) {
        testFilter({ value: MAX_BIGINT_VALUE, withRunButton });
      }

      function testDecimalFilter({
        withRunButton,
      }: { withRunButton?: boolean } = {}) {
        testFilter({ value: NEGATIVE_DECIMAL_VALUE, withRunButton });
      }

      cy.log("create tables");
      setupTables();

      cy.log("BIGINT");
      cy.signInAsAdmin();
      setupQuestion({
        tableName: BIGINT_PK_TABLE_NAME,
        baseType: "type/BigInteger",
      });
      H.visitQuestion("@questionId");
      testBitIntFilter({ withRunButton: true });
      visitPublicQuestion();
      testBitIntFilter();
      visitEmbeddedQuestion();
      testBitIntFilter();

      cy.log("DECIMAL");
      cy.signInAsAdmin();
      setupQuestion({
        tableName: DECIMAL_PK_TABLE_NAME,
        baseType: "type/Decimal",
      });
      H.visitQuestion("@questionId");
      testDecimalFilter({ withRunButton: true });
      visitPublicQuestion();
      testDecimalFilter();
      visitEmbeddedQuestion();
      testDecimalFilter();
    },
  );

  it("query builder + expression editor", { tags: "@external" }, () => {
    function setupQuestion({ tableName }: { tableName: string }) {
      const getQuestionDetails = (tableId: TableId) => ({
        database: WRITABLE_DB_ID,
        query: {
          "source-table": tableId,
        },
      });

      getTableId(tableName).then((tableId) => {
        H.createQuestion(getQuestionDetails(tableId), { visitQuestion: true });
      });
    }

    function testExpression({ value }: { value: string }) {
      H.assertQueryBuilderRowCount(3);

      H.openNotebook();
      H.getNotebookStep("data").button("Filter").click();
      H.popover().findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: `[ID] = ${value}` });
      cy.button("Done").click();
      H.visualize();
      H.assertQueryBuilderRowCount(1);

      H.openNotebook();
      H.getNotebookStep("filter").findByText(`ID is ${value}`).click();
      H.popover().within(() => {
        cy.findByLabelText("Back").click();
        cy.findByText("Custom Expression").click();
      });
      H.enterCustomColumnDetails({ formula: `[ID] != ${value}` });
      cy.button("Update").click();
      H.visualize();
      H.assertQueryBuilderRowCount(2);
    }

    cy.log("setup");
    setupTables();

    cy.log("BIGINT");
    setupQuestion({ tableName: BIGINT_PK_TABLE_NAME });
    testExpression({ value: MAX_BIGINT_VALUE });

    cy.log("DECIMAL");
    setupQuestion({ tableName: DECIMAL_PK_TABLE_NAME });
    testExpression({ value: NEGATIVE_DECIMAL_VALUE });
  });

  it("query builder + object detail", { tags: "@external" }, () => {
    function setupQuestion({ tableName }: { tableName: string }) {
      getTableId(tableName).then((tableId) =>
        H.createQuestion(
          {
            database: WRITABLE_DB_ID,
            query: { "source-table": tableId },
          },
          { visitQuestion: true },
        ),
      );
    }

    function testObjectDetail({
      idValue,
      nameValue,
    }: {
      idValue: string;
      nameValue: string;
    }) {
      H.tableInteractive().findByText(idValue).click();
      H.modal().within(() => {
        cy.findAllByText(idValue).should("have.length.gte", 1);
        cy.findAllByText(nameValue).should("have.length.gte", 1);
      });
    }

    cy.log("setup");
    setupTables();

    cy.log("BIGINT");
    setupQuestion({ tableName: BIGINT_PK_TABLE_NAME });
    testObjectDetail({
      idValue: MAX_BIGINT_VALUE,
      nameValue: "Positive",
    });

    cy.log("DECIMAL");
    setupQuestion({ tableName: DECIMAL_PK_TABLE_NAME });
    testObjectDetail({
      idValue: NEGATIVE_DECIMAL_VALUE,
      nameValue: "Negative",
    });
  });

  it("query builder + drills", () => {
    function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const getTargetQuestionDetails = (
        cardId: CardId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        query: {
          "source-table": `card__${cardId}`,
        },
        display: "table",
      });

      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createQuestion(getTargetQuestionDetails(card.id), {
          visitQuestion: true,
        });
      });
    }

    function testDrill({
      value,
      formattedValue,
    }: {
      value: string;
      formattedValue: string;
    }) {
      H.assertQueryBuilderRowCount(3);
      H.tableInteractive().findByText(formattedValue).click();
      H.popover().findByText("=").click();
      H.queryBuilderFiltersPanel()
        .findByText(`NUMBER is equal to ${value}`)
        .should("be.visible");
      H.assertQueryBuilderRowCount(1);
    }

    cy.log("BIGINT");
    setupQuestion({ sourceQuestionDetails: bigIntQuestionDetails });
    testDrill({
      value: MAX_BIGINT_VALUE,
      formattedValue: FORMATTED_MAX_BIGINT_VALUE,
    });

    cy.log("DECIMAL");
    setupQuestion({ sourceQuestionDetails: decimalQuestionDetails });
    testDrill({
      value: NEGATIVE_DECIMAL_VALUE,
      formattedValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
    });
  });

  it("query builder + export", { tags: "@external" }, () => {
    function setupTableQuestion({ tableName }: { tableName: string }) {
      const getTargetQuestionDetails = (
        tableId: TableId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        database: WRITABLE_DB_ID,
        query: {
          "source-table": tableId,
        },
        display: "table",
      });

      getTableId(tableName).then((tableId) => {
        H.createQuestion(getTargetQuestionDetails(tableId), {
          wrapId: true,
          visitQuestion: true,
        });
      });
    }

    function setupNestedQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const getTargetQuestionDetails = (
        cardId: CardId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        query: {
          "source-table": `card__${cardId}`,
        },
        display: "table",
      });

      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createQuestion(getTargetQuestionDetails(card.id), {
          wrapId: true,
          visitQuestion: true,
        });
      });
    }

    function testExport({
      columnName,
      formattedMinValue,
      formattedMaxValue,
    }: {
      columnName: string;
      formattedMinValue: string;
      formattedMaxValue: string;
    }) {
      cy.get("@questionId").then((questionId) => {
        H.downloadAndAssert(
          {
            fileType: "csv",
            questionId: Number(questionId),
            isDashboard: false,
            enableFormatting: true,
          },
          (sheet: Sheet) => {
            expect(sheet["A1"].v).to.eq(columnName);
            expect(sheet["A2"].w).to.eq(formattedMinValue);
            expect(sheet["A4"].w).to.eq(formattedMaxValue);
          },
        );
      });
    }

    cy.log("setup");
    setupTables();

    cy.log("BIGINT");
    setupTableQuestion({ tableName: BIGINT_PK_TABLE_NAME });
    testExport({
      columnName: "ID",
      formattedMinValue: MIN_BIGINT_VALUE,
      formattedMaxValue: MAX_BIGINT_VALUE,
    });
    setupNestedQuestion({ sourceQuestionDetails: bigIntQuestionDetails });
    testExport({
      columnName: "NUMBER",
      formattedMinValue: FORMATTED_MIN_BIGINT_VALUE,
      formattedMaxValue: FORMATTED_MAX_BIGINT_VALUE,
    });

    cy.log("DECIMAL");
    setupTableQuestion({ tableName: DECIMAL_PK_TABLE_NAME });
    testExport({
      columnName: "ID",
      formattedMinValue: NEGATIVE_DECIMAL_VALUE,
      formattedMaxValue: POSITIVE_DECIMAL_VALUE,
    });
    setupNestedQuestion({ sourceQuestionDetails: decimalQuestionDetails });
    testExport({
      columnName: "NUMBER",
      formattedMinValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
      formattedMaxValue: FORMATTED_POSITIVE_DECIMAL_VALUE,
    });
  });

  it("dashboards + click behavior", () => {
    function setupDashboard({
      sourceQuestionDetails,
      baseType,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      baseType: string;
    }) {
      const parameterDetails: Parameter = {
        id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
        type: "number/=",
        target: ["dimension", ["field", "NUMBER", { "base-type": baseType }]],
        name: "Number",
        slug: "number",
      };

      const dashboardDetails: DashboardDetails = {
        parameters: [parameterDetails],
      };

      const vizSettings: VisualizationSettings = {
        column_settings: {
          '["name","NUMBER"]': {
            click_behavior: {
              type: "crossfilter",
              parameterMapping: {
                [parameterDetails.id]: {
                  id: parameterDetails.id,
                  source: { id: "NUMBER", name: "NUMBER", type: "column" },
                  target: {
                    id: parameterDetails.id,
                    type: "parameter",
                  },
                },
              },
            },
          },
        },
      };

      const getTargetQuestionDetails = (
        cardId: CardId,
      ): StructuredQuestionDetails => ({
        name: "MBQL",
        query: {
          "source-table": `card__${cardId}`,
        },
        display: "table",
      });

      const getParameterMapping = (
        cardId: CardId,
      ): DashboardParameterMapping => ({
        card_id: cardId,
        parameter_id: parameterDetails.id,
        target: ["dimension", ["field", "NUMBER", { "base-type": baseType }]],
      });

      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createQuestionAndDashboard({
          questionDetails: getTargetQuestionDetails(card.id),
          dashboardDetails,
        }).then(({ body: dashcard, questionId }) => {
          const { dashboard_id } = dashcard;

          H.editDashboardCard(dashcard, {
            parameter_mappings: [getParameterMapping(questionId)],
            visualization_settings: vizSettings,
          });

          H.visitDashboard(dashboard_id);
        });
      });
    }

    function testClickBehavior({
      formattedMinValue,
      formattedMaxValue,
    }: {
      formattedMinValue: string;
      formattedMaxValue: string;
    }) {
      H.getDashboardCard().within(() => {
        cy.findByText("0").should("be.visible");
        cy.findByText(formattedMinValue).should("be.visible");
        cy.findByText(formattedMaxValue).click();
      });
      H.filterWidget().findByText(formattedMaxValue).should("be.visible");
      H.getDashboardCard().within(() => {
        cy.findByText(formattedMinValue).should("not.exist");
        cy.findByText(formattedMaxValue).should("be.visible");
      });
    }

    cy.log("BIGINT");
    setupDashboard({
      sourceQuestionDetails: bigIntQuestionDetails,
      baseType: "type/BigInteger",
    });
    testClickBehavior({
      formattedMinValue: FORMATTED_MIN_BIGINT_VALUE,
      formattedMaxValue: FORMATTED_MAX_BIGINT_VALUE,
    });

    cy.log("DECIMAL");
    setupDashboard({
      sourceQuestionDetails: decimalQuestionDetails,
      baseType: "type/Decimal",
    });
    testClickBehavior({
      formattedMinValue: FORMATTED_NEGATIVE_DECIMAL_VALUE,
      formattedMaxValue: FORMATTED_POSITIVE_DECIMAL_VALUE,
    });
  });
});

function setupTables() {
  const dialect = "postgres";
  H.restore("postgres-writable");
  H.resetTestTable({ type: dialect, table: BIGINT_PK_TABLE_NAME });
  H.resetTestTable({ type: dialect, table: DECIMAL_PK_TABLE_NAME });
  H.resyncDatabase({ dbId: WRITABLE_DB_ID });
}

function getTableId(tableName: string) {
  return cy
    .request("GET", "/api/table")
    .then(({ body: tables }: { body: Table[] }) => {
      const table = tables.find((table) => table.name === tableName);
      if (!table) {
        throw new TypeError(`Table with name ${tableName} cannot be found`);
      }
      return table.id;
    });
}

function getFieldId(tableId: TableId, fieldName: string) {
  return cy
    .request("GET", `/api/table/${tableId}/query_metadata`)
    .then(({ body: table }: { body: Table }) => {
      const fields = table.fields ?? [];
      const field = fields.find((field) => field.name === fieldName);
      if (!field) {
        throw new TypeError(`Field with name ${fieldName} cannot be found`);
      }
      if (typeof field.id !== "number") {
        throw new TypeError("Unexpected non-integer field id.");
      }
      return field.id;
    });
}

function visitPublicQuestion() {
  cy.signInAsAdmin();
  cy.get("@questionId").then((questionId) => {
    H.visitPublicQuestion(Number(questionId));
  });
}

function visitEmbeddedQuestion() {
  cy.get("@questionId").then((questionId) => {
    const payload = {
      resource: { question: Number(questionId) },
      params: {},
    };
    H.visitEmbeddedPage(payload);
  });
}

function visitPublicDashboard() {
  cy.signInAsAdmin();
  cy.get("@dashboardId").then((dashboardId) => {
    H.visitPublicDashboard(Number(dashboardId));
  });
}

function visitEmbeddedDashboard() {
  cy.get("@dashboardId").then((dashboardId) => {
    const payload = {
      resource: { dashboard: Number(dashboardId) },
      params: {},
    };
    H.visitEmbeddedPage(payload);
  });
}

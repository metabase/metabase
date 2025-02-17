import type {
  DashboardDetails,
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { DashboardParameterMapping, Parameter } from "metabase-types/api";

const { H } = cy;

describe("scenarios > filters > bigint (metabase#5816)", () => {
  const minBigIntValue = "-9223372036854775808";
  const maxBigIntValue = "9223372036854775807";
  const negativeDecimalValue = "-9223372036854775809";
  const positiveDecimalValue = "9223372036854775808";

  const bigIntQuestionDetails: NativeQuestionDetails = {
    name: "SQL NUMBER",
    native: {
      query: `SELECT ${minBigIntValue} AS NUMBER
UNION ALL
SELECT 0 AS NUMBER
UNION ALL
SELECT ${maxBigIntValue} AS NUMBER`,
      "template-tags": {},
    },
    display: "table",
  };

  const decimalQuestionDetails: NativeQuestionDetails = {
    name: "SQL NUMBER",
    native: {
      query: `SELECT CAST('${negativeDecimalValue}' AS DECIMAL) AS NUMBER
UNION ALL
SELECT CAST(0 AS DECIMAL) AS NUMBER
UNION ALL
SELECT CAST('${positiveDecimalValue}' AS DECIMAL) AS NUMBER`,
      "template-tags": {},
    },
    display: "table",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("mbql query + query builder", () => {
    function setupQuestion({
      sourceQuestionDetails,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
    }) {
      const getTargetQuestionDetails = (
        cardId: number,
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

    function testFilterSet({
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
        filterDisplayName: `NUMBER is equal to "${maxValue}"`,
        filteredRowCount: 1,
      });

      cy.log("!= operator");
      testFilter({
        filterOperator: "Not equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is not equal to "${minValue}"`,
        filteredRowCount: 2,
      });

      cy.log("> operator");
      testFilter({
        filterOperator: "Greater than",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is greater than "${minValue}"`,
        filteredRowCount: 2,
      });

      cy.log(">= operator");
      testFilter({
        filterOperator: "Greater than or equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is greater than or equal to "${minValue}"`,
        filteredRowCount: 3,
      });

      cy.log("< operator");
      testFilter({
        filterOperator: "Less than",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is less than "${maxValue}"`,
        filteredRowCount: 2,
      });

      cy.log("<= operator");
      testFilter({
        filterOperator: "Less than or equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is less than or equal to "${maxValue}"`,
        filteredRowCount: 3,
      });

      cy.log("between operator - min value");
      testFilter({
        filterOperator: "Between",
        setFilterValue: () => {
          cy.findByPlaceholderText("Min").type(minValue);
          cy.findByPlaceholderText("Max").type("0");
        },
        filterDisplayName: `NUMBER is between "${minValue}" and 0`,
        filteredRowCount: 2,
      });

      cy.log("between operator - max value");
      testFilter({
        filterOperator: "Between",
        setFilterValue: () => {
          cy.findByPlaceholderText("Min").type("0");
          cy.findByPlaceholderText("Max").type(maxValue);
        },
        filterDisplayName: `NUMBER is between 0 and "${maxValue}"`,
        filteredRowCount: 2,
      });

      cy.log("between operator - min and max values");
      testFilter({
        filterOperator: "Between",
        setFilterValue: () => {
          cy.findByPlaceholderText("Min").type(minValue);
          cy.findByPlaceholderText("Max").type(maxValue);
        },
        filterDisplayName: `NUMBER is ${minValue} – ${maxValue}`,
        filteredRowCount: 3,
      });
    }

    cy.log("BIGINT");
    testFilterSet({
      sourceQuestionDetails: bigIntQuestionDetails,
      minValue: minBigIntValue,
      maxValue: maxBigIntValue,
    });

    cy.log("DECIMAL");
    testFilterSet({
      sourceQuestionDetails: decimalQuestionDetails,
      minValue: negativeDecimalValue,
      maxValue: positiveDecimalValue,
    });
  });

  it("mbql query + dashboards + number parameters", () => {
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
      };

      const getTargetQuestionDetails = (
        cardId: number,
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
        cardId: number,
      ): DashboardParameterMapping => ({
        parameter_id: parameterId,
        card_id: cardId,
        target: ["dimension", ["field", "NUMBER", { "base-type": baseType }]],
      });

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
                      parameter_mappings: parameters.map(parameter =>
                        getParameterMapping(parameter.id, targetCard.id),
                      ),
                    },
                  });
                  H.visitDashboard(dashboard.id);
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
    }: {
      parameterName: string;
      setParameterValue: () => void;
      filterDisplayName: string;
      filterArgsDisplayName: string;
      filteredRowCount: number;
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

      cy.log("drill-thru");
      H.getDashboardCard().findByText("MBQL").click();
      H.queryBuilderFiltersPanel().findByText(filterDisplayName);
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .should("have.text", String(filteredRowCount));

      cy.log("cleanup");
      H.queryBuilderHeader().findByLabelText("Back to Dashboard").click();
      findFilterWidget(parameterName).icon("close").click();
    }

    function testFilterSet({
      sourceQuestionDetails,
      baseType,
      minValue,
      maxValue,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      baseType: string;
      minValue: string;
      maxValue: string;
    }) {
      cy.log("setup");
      setupDashboard({ sourceQuestionDetails, baseType });

      cy.log("number/= parameter");
      testFilter({
        parameterName: "Equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(maxValue),
        filterDisplayName: `NUMBER is equal to "${maxValue}"`,
        filterArgsDisplayName: maxValue,
        filteredRowCount: 1,
      });

      cy.log("number/!= parameter");
      testFilter({
        parameterName: "Not equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(minValue),
        filterDisplayName: `NUMBER is not equal to "${minValue}"`,
        filterArgsDisplayName: minValue,
        filteredRowCount: 2,
      });

      cy.log("number/>= parameter");
      testFilter({
        parameterName: "Greater than or equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(minValue),
        filterDisplayName: `NUMBER is greater than or equal to "${minValue}"`,
        filterArgsDisplayName: minValue,
        filteredRowCount: 3,
      });

      cy.log("number/<= parameter");
      testFilter({
        parameterName: "Less than or equal to",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(maxValue),
        filterDisplayName: `NUMBER is less than or equal to "${maxValue}"`,
        filterArgsDisplayName: maxValue,
        filteredRowCount: 3,
      });

      cy.log("number/between parameter - min value");
      testFilter({
        parameterName: "Between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type(minValue);
          cy.findAllByPlaceholderText("Enter a number").eq(1).type("0");
        },
        filterDisplayName: `NUMBER is between "${minValue}" and 0`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 2,
      });

      cy.log("number/between parameter - max value");
      testFilter({
        parameterName: "Between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
          cy.findAllByPlaceholderText("Enter a number").eq(1).type(maxValue);
        },
        filterDisplayName: `NUMBER is between 0 and "${maxValue}"`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 2,
      });

      cy.log("number/between parameter - min and max values");
      testFilter({
        parameterName: "Between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type(minValue);
          cy.findAllByPlaceholderText("Enter a number").eq(1).type(maxValue);
        },
        filterDisplayName: `NUMBER is ${minValue} – ${maxValue}`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 3,
      });
    }

    testFilterSet({
      sourceQuestionDetails: bigIntQuestionDetails,
      baseType: "type/BigInteger",
      minValue: minBigIntValue,
      maxValue: maxBigIntValue,
    });

    testFilterSet({
      sourceQuestionDetails: decimalQuestionDetails,
      baseType: "type/Decimal",
      minValue: negativeDecimalValue,
      maxValue: positiveDecimalValue,
    });
  });

  it("native query + variable + query builder", () => {
    function testFilter({
      sourceQuestionDetails,
      value,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      value: string;
    }) {
      const getTargetQuestionDetails = (
        cardId: number,
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

      cy.log("create a question");
      H.createNativeQuestion(sourceQuestionDetails).then(({ body: card }) => {
        H.createNativeQuestion(getTargetQuestionDetails(card.id), {
          visitQuestion: true,
        });
      });
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .should("have.text", "3");

      cy.log("add a filter");
      H.filterWidget().findByRole("textbox").type(value);
      H.filterWidget().findByRole("textbox").should("have.value", value);
      H.queryBuilderMain().findAllByTestId("run-button").eq(1).click();
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .should("have.text", "1");
    }

    cy.log("BIGINT");
    testFilter({
      sourceQuestionDetails: bigIntQuestionDetails,
      value: maxBigIntValue,
    });

    cy.log("DECIMAL");
    // TODO values.clj https://github.com/metabase/metabase/blob/63c69f5461ad877bf1e6cf036ef8db25489b1a42/src/metabase/driver/common/parameters/values.clj#L293
    // testFilter({
    //   sourceQuestionDetails: decimalQuestionDetails,
    //   value: negativeDecimalValue,
    // });
  });

  it("native query + variable + dashboards", () => {
    function testFilter({
      sourceQuestionDetails,
      value,
    }: {
      sourceQuestionDetails: NativeQuestionDetails;
      value: string;
    }) {
      const parameterDetails: Parameter = {
        id: "b6ed2d71",
        type: "number/=",
        name: "Number",
        slug: "number",
        sectionId: "number",
      };

      const dashboardDetails: DashboardDetails = {
        parameters: [parameterDetails],
      };

      const getTargetQuestionDetails = (
        cardId: number,
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
        cardId: number,
      ): DashboardParameterMapping => ({
        card_id: cardId,
        parameter_id: parameterDetails.id,
        target: ["variable", ["template-tag", "number"]],
      });

      cy.log("create a dashboard");
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

      cy.log("add a filter");
      H.visitDashboard("@dashboardId");
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "3");
      H.filterWidget().findByRole("textbox").type(value).blur();
      H.filterWidget().findByRole("textbox").should("have.value", value);
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", "1");

      cy.log("drill-thru");
      H.getDashboardCard().findByText("SQL").click();
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .should("have.text", "1");
      H.filterWidget().findByRole("textbox").should("have.value", value);
    }

    cy.log("BIGINT");
    testFilter({
      sourceQuestionDetails: bigIntQuestionDetails,
      value: maxBigIntValue,
    });

    cy.log("DECIMAL");
    // TODO values.clj https://github.com/metabase/metabase/blob/63c69f5461ad877bf1e6cf036ef8db25489b1a42/src/metabase/driver/common/parameters/values.clj#L293
    // testFilter({
    //   sourceQuestionDetails: decimalQuestionDetails,
    //   value: positiveDecimalValue,
    // });
  });
});

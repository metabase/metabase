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
    },
    display: "table",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("mbql query + query builder", () => {
    function testFilter({
      questionDetails,
      filterOperator,
      setFilterValue,
      filterDisplayName,
      filteredRowCount,
    }: {
      questionDetails: NativeQuestionDetails;
      filterOperator: string;
      setFilterValue: () => void;
      filterDisplayName: string;
      filteredRowCount: number;
    }) {
      cy.log("create a question");
      H.createNativeQuestion(questionDetails, { visitQuestion: true });
      H.queryBuilderHeader().findByText("Explore results").click();
      H.assertQueryBuilderRowCount(3);

      cy.log("add a filter");
      H.openNotebook();
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
    }

    function testColumnType({
      questionDetails,
      minValue,
      maxValue,
    }: {
      questionDetails: NativeQuestionDetails;
      minValue: string;
      maxValue: string;
    }) {
      cy.log("= operator");
      testFilter({
        questionDetails,
        filterOperator: "Equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is equal to "${maxValue}"`,
        filteredRowCount: 1,
      });

      cy.log("!= operator");
      testFilter({
        questionDetails,
        filterOperator: "Not equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is not equal to "${minValue}"`,
        filteredRowCount: 2,
      });

      cy.log("> operator");
      testFilter({
        questionDetails,
        filterOperator: "Greater than",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is greater than "${minValue}"`,
        filteredRowCount: 2,
      });

      cy.log(">= operator");
      testFilter({
        questionDetails,
        filterOperator: "Greater than or equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(minValue),
        filterDisplayName: `NUMBER is greater than or equal to "${minValue}"`,
        filteredRowCount: 3,
      });

      cy.log("< operator");
      testFilter({
        questionDetails,
        filterOperator: "Less than",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is less than "${maxValue}"`,
        filteredRowCount: 2,
      });

      cy.log("<= operator");
      testFilter({
        questionDetails,
        filterOperator: "Less than or equal to",
        setFilterValue: () => cy.findByLabelText("Filter value").type(maxValue),
        filterDisplayName: `NUMBER is less than or equal to "${maxValue}"`,
        filteredRowCount: 3,
      });

      cy.log("between operator - min value");
      testFilter({
        questionDetails,
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
        questionDetails,
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
        questionDetails,
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
    testColumnType({
      questionDetails: bigIntQuestionDetails,
      minValue: minBigIntValue,
      maxValue: maxBigIntValue,
    });

    cy.log("DECIMAL");
    testColumnType({
      questionDetails: decimalQuestionDetails,
      minValue: negativeDecimalValue,
      maxValue: positiveDecimalValue,
    });
  });

  it("mbql query + dashboards", () => {
    function testFilter({
      questionDetails,
      baseType,
      parameterType,
      parameterSectionId = "number",
      setParameterValue,
      filterDisplayName,
      filterArgsDisplayName,
      filteredRowCount,
    }: {
      questionDetails: NativeQuestionDetails;
      baseType: string;
      parameterType: string;
      parameterSectionId?: string;
      setParameterValue: () => void;
      filterDisplayName: string;
      filterArgsDisplayName: string;
      filteredRowCount: number;
    }) {
      const parameterDetails: Parameter = {
        id: "b6ed2d71",
        type: parameterType,
        name: "Number",
        slug: "number",
        sectionId: parameterSectionId,
      };

      const dashboardDetails: DashboardDetails = {
        parameters: [parameterDetails],
      };

      const getQuestionDetails = (
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
        cardId: number,
      ): DashboardParameterMapping => ({
        card_id: cardId,
        parameter_id: parameterDetails.id,
        target: ["dimension", ["field", "NUMBER", { "base-type": baseType }]],
      });

      cy.log("create a dashboard");
      H.createNativeQuestion(questionDetails).then(({ body: card }) => {
        H.createQuestionAndDashboard({
          questionDetails: getQuestionDetails(card.id),
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
      H.filterWidget().click();
      H.popover().within(() => {
        setParameterValue();
        cy.button("Add filter").click();
      });
      H.filterWidget().findByText(filterArgsDisplayName).should("be.visible");
      H.getDashboardCard()
        .findByTestId("scalar-value")
        .should("have.text", String(filteredRowCount));

      cy.log("drill-thru");
      H.getDashboardCard().findByText("MBQL").click();
      H.queryBuilderFiltersPanel().findByText(filterDisplayName);
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .should("have.text", String(filteredRowCount));
    }

    function testColumnType({
      questionDetails,
      baseType,
      minValue,
      maxValue,
    }: {
      questionDetails: NativeQuestionDetails;
      baseType: string;
      minValue: string;
      maxValue: string;
    }) {
      cy.log("id parameter");
      // TODO https://github.com/metabase/metabase/blob/6694870932830ff36964edd8b2c4555b81ddeda8/src/metabase/query_processor/middleware/parameters/mbql.clj#L21
      // testFilter({
      //   questionDetails,
      //   baseType,
      //   parameterType: "id",
      //   parameterSectionId: "id",
      //   setParameterValue: () =>
      //     cy.findByPlaceholderText("Enter an ID").type(maxValue),
      //   filterDisplayName: `NUMBER is equal to "${maxValue}"`,
      //   filterArgsDisplayName: maxValue,
      //   filteredRowCount: 1,
      // });

      cy.log("number/= parameter");
      testFilter({
        questionDetails,
        baseType,
        parameterType: "number/=",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(maxValue),
        filterDisplayName: `NUMBER is equal to "${maxValue}"`,
        filterArgsDisplayName: maxValue,
        filteredRowCount: 1,
      });

      cy.log("number/!= parameter");
      testFilter({
        questionDetails,
        baseType,
        parameterType: "number/!=",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(minValue),
        filterDisplayName: `NUMBER is not equal to "${minValue}"`,
        filterArgsDisplayName: minValue,
        filteredRowCount: 2,
      });

      cy.log("number/>= parameter");
      testFilter({
        questionDetails,
        baseType,
        parameterType: "number/>=",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(minValue),
        filterDisplayName: `NUMBER is greater than or equal to "${minValue}"`,
        filterArgsDisplayName: minValue,
        filteredRowCount: 3,
      });

      cy.log("number/<= parameter");
      testFilter({
        questionDetails,
        baseType,
        parameterType: "number/<=",
        setParameterValue: () =>
          cy.findByPlaceholderText("Enter a number").type(maxValue),
        filterDisplayName: `NUMBER is less than or equal to "${maxValue}"`,
        filterArgsDisplayName: maxValue,
        filteredRowCount: 3,
      });

      cy.log("number/between parameter - min value");
      testFilter({
        questionDetails,
        baseType,
        parameterType: "number/between",
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
        questionDetails,
        baseType,
        parameterType: "number/between",
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
        questionDetails,
        baseType,
        parameterType: "number/between",
        setParameterValue: () => {
          cy.findAllByPlaceholderText("Enter a number").eq(0).type(minValue);
          cy.findAllByPlaceholderText("Enter a number").eq(1).type(maxValue);
        },
        filterDisplayName: `NUMBER is ${minValue} – ${maxValue}`,
        filterArgsDisplayName: "2 selections",
        filteredRowCount: 3,
      });
    }

    testColumnType({
      questionDetails: bigIntQuestionDetails,
      baseType: "type/BigInteger",
      minValue: minBigIntValue,
      maxValue: maxBigIntValue,
    });

    testColumnType({
      questionDetails: decimalQuestionDetails,
      baseType: "type/Decimal",
      minValue: negativeDecimalValue,
      maxValue: positiveDecimalValue,
    });
  });

  it("native query + query builder + variable", () => {
    function testFilter({
      questionDetails,
      value,
    }: {
      questionDetails: NativeQuestionDetails;
      value: string;
    }) {
      const getQuestionDetails = (cardId: number): NativeQuestionDetails => {
        const cardTagName = `#${cardId}-sql-number`;

        return {
          name: "MBQL",
          native: {
            query: `SELECT COUNT(*) FROM {{#${cardId}-sql-number}} [[WHERE NUMBER = {{number}}]]`,
            "template-tags": {
              [cardTagName]: {
                id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
                name: cardTagName,
                "display-name": cardTagName,
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
      H.createNativeQuestion(questionDetails).then(({ body: card }) => {
        H.createNativeQuestion(getQuestionDetails(card.id), {
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
      questionDetails: bigIntQuestionDetails,
      value: maxBigIntValue,
    });

    cy.log("DECIMAL");
    // TODO https://github.com/metabase/metabase/blob/63c69f5461ad877bf1e6cf036ef8db25489b1a42/src/metabase/driver/common/parameters/values.clj#L293
    // testFilter({
    //   questionDetails: decimalQuestionDetails,
    //   value: negativeDecimalValue,
    // });
  });
});

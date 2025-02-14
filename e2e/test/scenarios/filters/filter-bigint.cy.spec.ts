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
    name: "SQL BIGINT",
    native: {
      query: `SELECT ${minBigIntValue} AS BIGINT
UNION ALL
SELECT 0 AS BIGINT
UNION ALL
SELECT ${maxBigIntValue} AS BIGINT`,
    },
    display: "table",
  };

  const decimalQuestionDetails: NativeQuestionDetails = {
    name: "SQL DECIMAL",
    native: {
      query: `SELECT CAST('${negativeDecimalValue}' AS DECIMAL) AS DECIMAL
UNION ALL
SELECT CAST(0 AS DECIMAL) AS DECIMAL
UNION ALL
SELECT CAST('${positiveDecimalValue}' AS DECIMAL) AS DECIMAL`,
    },
    display: "table",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("mbql query + query builder + BIGINT column ", () => {
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
      cy.log("create a question");
      H.createNativeQuestion(bigIntQuestionDetails, { visitQuestion: true });
      H.queryBuilderHeader().findByText("Explore results").click();
      H.assertQueryBuilderRowCount(3);

      cy.log("add a filter");
      H.openNotebook();
      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("BIGINT").click();
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

    cy.log("= operator");
    testFilter({
      filterOperator: "Equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(maxBigIntValue),
      filterDisplayName: `BIGINT is equal to "${maxBigIntValue}"`,
      filteredRowCount: 1,
    });

    cy.log("!= operator");
    testFilter({
      filterOperator: "Not equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(minBigIntValue),
      filterDisplayName: `BIGINT is not equal to "${minBigIntValue}"`,
      filteredRowCount: 2,
    });

    cy.log("> operator");
    testFilter({
      filterOperator: "Greater than",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(minBigIntValue),
      filterDisplayName: `BIGINT is greater than "${minBigIntValue}"`,
      filteredRowCount: 2,
    });

    cy.log(">= operator");
    testFilter({
      filterOperator: "Greater than or equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(minBigIntValue),
      filterDisplayName: `BIGINT is greater than or equal to "${minBigIntValue}"`,
      filteredRowCount: 3,
    });

    cy.log("< operator");
    testFilter({
      filterOperator: "Less than",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(maxBigIntValue),
      filterDisplayName: `BIGINT is less than "${maxBigIntValue}"`,
      filteredRowCount: 2,
    });

    cy.log("<= operator");
    testFilter({
      filterOperator: "Less than or equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(maxBigIntValue),
      filterDisplayName: `BIGINT is less than or equal to "${maxBigIntValue}"`,
      filteredRowCount: 3,
    });

    cy.log("between operator - min value");
    testFilter({
      filterOperator: "Between",
      setFilterValue: () => {
        cy.findByPlaceholderText("Min").type(minBigIntValue);
        cy.findByPlaceholderText("Max").type("0");
      },
      filterDisplayName: `BIGINT is between "${minBigIntValue}" and 0`,
      filteredRowCount: 2,
    });

    cy.log("between operator - max value");
    testFilter({
      filterOperator: "Between",
      setFilterValue: () => {
        cy.findByPlaceholderText("Min").type("0");
        cy.findByPlaceholderText("Max").type(maxBigIntValue);
      },
      filterDisplayName: `BIGINT is between 0 and "${maxBigIntValue}"`,
      filteredRowCount: 2,
    });

    cy.log("between operator - min and max values");
    testFilter({
      filterOperator: "Between",
      setFilterValue: () => {
        cy.findByPlaceholderText("Min").type(minBigIntValue);
        cy.findByPlaceholderText("Max").type(maxBigIntValue);
      },
      filterDisplayName: `BIGINT is ${minBigIntValue} – ${maxBigIntValue}`,
      filteredRowCount: 3,
    });
  });

  it("mbql query + query builder + DECIMAL column ", () => {
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
      cy.log("create a question");
      H.createNativeQuestion(decimalQuestionDetails, { visitQuestion: true });
      H.queryBuilderHeader().findByText("Explore results").click();
      H.assertQueryBuilderRowCount(3);

      cy.log("add a filter");
      H.openNotebook();
      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("DECIMAL").click();
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

    cy.log("= operator");
    testFilter({
      filterOperator: "Equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(positiveDecimalValue),
      filterDisplayName: `DECIMAL is equal to "${positiveDecimalValue}"`,
      filteredRowCount: 1,
    });

    cy.log("!= operator");
    testFilter({
      filterOperator: "Not equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(negativeDecimalValue),
      filterDisplayName: `DECIMAL is not equal to "${negativeDecimalValue}"`,
      filteredRowCount: 2,
    });

    cy.log("> operator");
    testFilter({
      filterOperator: "Greater than",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(negativeDecimalValue),
      filterDisplayName: `DECIMAL is greater than "${negativeDecimalValue}"`,
      filteredRowCount: 2,
    });

    cy.log(">= operator");
    testFilter({
      filterOperator: "Greater than or equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(negativeDecimalValue),
      filterDisplayName: `DECIMAL is greater than or equal to "${negativeDecimalValue}"`,
      filteredRowCount: 3,
    });

    cy.log("< operator");
    testFilter({
      filterOperator: "Less than",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(positiveDecimalValue),
      filterDisplayName: `DECIMAL is less than "${positiveDecimalValue}"`,
      filteredRowCount: 2,
    });

    cy.log("<= operator");
    testFilter({
      filterOperator: "Less than or equal to",
      setFilterValue: () =>
        cy.findByLabelText("Filter value").type(positiveDecimalValue),
      filterDisplayName: `DECIMAL is less than or equal to "${positiveDecimalValue}"`,
      filteredRowCount: 3,
    });

    cy.log("between operator - min value");
    testFilter({
      filterOperator: "Between",
      setFilterValue: () => {
        cy.findByPlaceholderText("Min").type(negativeDecimalValue);
        cy.findByPlaceholderText("Max").type("0");
      },
      filterDisplayName: `DECIMAL is between "${negativeDecimalValue}" and 0`,
      filteredRowCount: 2,
    });

    cy.log("between operator - max value");
    testFilter({
      filterOperator: "Between",
      setFilterValue: () => {
        cy.findByPlaceholderText("Min").type("0");
        cy.findByPlaceholderText("Max").type(positiveDecimalValue);
      },
      filterDisplayName: `DECIMAL is between 0 and "${positiveDecimalValue}"`,
      filteredRowCount: 2,
    });

    cy.log("between operator - min and max values");
    testFilter({
      filterOperator: "Between",
      setFilterValue: () => {
        cy.findByPlaceholderText("Min").type(negativeDecimalValue);
        cy.findByPlaceholderText("Max").type(positiveDecimalValue);
      },
      filterDisplayName: `DECIMAL is ${negativeDecimalValue} – ${positiveDecimalValue}`,
      filteredRowCount: 3,
    });
  });

  it("mbql query + dashboards + number parameter + BIGINT column", () => {
    function testFilter({
      parameterType,
      setParameterValue,
      filterDisplayName,
      filterArgsDisplayName,
      filteredRowCount,
    }: {
      parameterType: string;
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
        sectionId: "number",
      };

      const dashboardDetails: DashboardDetails = {
        parameters: [parameterDetails],
      };

      const getQuestionDetails = (
        cardId: number,
      ): StructuredQuestionDetails => ({
        name: "MBQL BIGINT",
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
        target: [
          "dimension",
          ["field", "BIGINT", { "base-type": "type/BigInteger" }],
        ],
      });

      cy.log("create a dashboard");
      H.createNativeQuestion(bigIntQuestionDetails).then(({ body: card }) => {
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
      H.getDashboardCard().findByText("MBQL BIGINT").click();
      H.queryBuilderFiltersPanel().findByText(filterDisplayName);
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .should("have.text", String(filteredRowCount));
    }

    cy.log("= operator");
    testFilter({
      parameterType: "number/=",
      setParameterValue: () =>
        cy.findByPlaceholderText("Enter a number").type(maxBigIntValue),
      filterDisplayName: `BIGINT is equal to "${maxBigIntValue}"`,
      filterArgsDisplayName: maxBigIntValue,
      filteredRowCount: 1,
    });

    cy.log("!= operator");
    testFilter({
      parameterType: "number/!=",
      setParameterValue: () =>
        cy.findByPlaceholderText("Enter a number").type(minBigIntValue),
      filterDisplayName: `BIGINT is not equal to "${minBigIntValue}"`,
      filterArgsDisplayName: minBigIntValue,
      filteredRowCount: 2,
    });

    cy.log(">= operator");
    testFilter({
      parameterType: "number/>=",
      setParameterValue: () =>
        cy.findByPlaceholderText("Enter a number").type(minBigIntValue),
      filterDisplayName: `BIGINT is greater than or equal to "${minBigIntValue}"`,
      filterArgsDisplayName: minBigIntValue,
      filteredRowCount: 3,
    });

    cy.log("<= operator");
    testFilter({
      parameterType: "number/<=",
      setParameterValue: () =>
        cy.findByPlaceholderText("Enter a number").type(maxBigIntValue),
      filterDisplayName: `BIGINT is less than or equal to "${maxBigIntValue}"`,
      filterArgsDisplayName: maxBigIntValue,
      filteredRowCount: 3,
    });

    cy.log("between operator - min value");
    testFilter({
      parameterType: "number/between",
      setParameterValue: () => {
        cy.findAllByPlaceholderText("Enter a number")
          .eq(0)
          .type(minBigIntValue);
        cy.findAllByPlaceholderText("Enter a number").eq(1).type("0");
      },
      filterDisplayName: `BIGINT is between "${minBigIntValue}" and 0`,
      filterArgsDisplayName: "2 selections",
      filteredRowCount: 2,
    });

    cy.log("between operator - max value");
    testFilter({
      parameterType: "number/between",
      setParameterValue: () => {
        cy.findAllByPlaceholderText("Enter a number").eq(0).type("0");
        cy.findAllByPlaceholderText("Enter a number")
          .eq(1)
          .type(maxBigIntValue);
      },
      filterDisplayName: `BIGINT is between 0 and "${maxBigIntValue}"`,
      filterArgsDisplayName: "2 selections",
      filteredRowCount: 2,
    });

    cy.log("between operator - min and max values");
    testFilter({
      parameterType: "number/between",
      setParameterValue: () => {
        cy.findAllByPlaceholderText("Enter a number")
          .eq(0)
          .type(minBigIntValue);
        cy.findAllByPlaceholderText("Enter a number")
          .eq(1)
          .type(maxBigIntValue);
      },
      filterDisplayName: `BIGINT is ${minBigIntValue} – ${maxBigIntValue}`,
      filterArgsDisplayName: "2 selections",
      filteredRowCount: 3,
    });
  });
});

import type { NativeQuestionDetails } from "e2e/support/helpers";

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

  it("mbql query + dashboards + number parameter + BIGINT column", () => {});
});

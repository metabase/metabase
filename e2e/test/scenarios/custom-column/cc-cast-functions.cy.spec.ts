import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

type CastTestCase = {
  name: string;
  expression: string;
  filterOperator: string;
  filterValue: string;
  expectedRowCount: number;
  expectedTableData?: {
    columns: string[];
    firstRows: string[][];
  };
};

const TEXT_TEST_CASES: CastTestCase[] = [
  {
    name: "Boolean",
    expression: "text(false)",
    filterOperator: "Starts with",
    filterValue: "FA",
    expectedRowCount: 200,
  },
  {
    name: "Number",
    expression: "text(10.5)",
    filterOperator: "Ends with",
    filterValue: ".5",
    expectedRowCount: 200,
  },
  {
    name: "String",
    expression: 'text("abc")',
    filterOperator: "Is",
    filterValue: "abc",
    expectedRowCount: 200,
  },
  {
    name: "NumberColumn",
    expression: "text([ID])",
    filterOperator: "Contains",
    filterValue: "10",
    expectedRowCount: 12,
  },
  {
    name: "StringColumn",
    expression: "text([Category])",
    filterOperator: "Does not contain",
    filterValue: "gadget",
    expectedRowCount: 147,
  },
  {
    name: "DateColumn",
    expression: "text([Created At])",
    filterOperator: "Contains",
    filterValue: "2018",
    expectedRowCount: 53,
  },
  {
    name: "NumberExpression",
    expression: "text([ID] * 2)",
    filterOperator: "Starts with",
    filterValue: "10",
    expectedRowCount: 6,
  },
];

const INTEGER_TEST_CASES: CastTestCase[] = [
  {
    name: "String",
    expression: 'integer("10")',
    filterOperator: "Equal to",
    filterValue: "10",
    expectedRowCount: 200,
  },
  {
    name: "StringExpression",
    expression: 'integer(concat([ID], ""))',
    filterOperator: "Equal to",
    filterValue: "29",
    expectedRowCount: 1,
  },
  {
    name: "FloatLiteral",
    expression: "integer(10.4)",
    filterOperator: "Equal to",
    filterValue: "10",
    expectedRowCount: 200,
  },
  {
    name: "FloatColumn",
    expression: "integer([Price])",
    filterOperator: "Equal to",
    filterValue: "29",
    expectedRowCount: 4,
  },
  {
    name: "FloatExpression",
    expression: "integer(42.333 + 0.56)",
    filterOperator: "Equal to",
    filterValue: "43",
    expectedRowCount: 200,
  },
];

const DATE_TEST_CASES: CastTestCase[] = [
  {
    name: "String",
    expression: 'date("2025-03-20")',
    filterOperator: "On",
    filterValue: "March 20, 2025",
    expectedRowCount: 200,
  },
  {
    name: "StringExpression",
    expression: 'date(concat("2025-03-", case([ID] = 1, "10", "20")))',
    filterOperator: "Before",
    filterValue: "March 15, 2025",
    expectedRowCount: 1,
  },
  {
    name: "Datetime",
    expression: "date([Created At])",
    filterOperator: "Before",
    filterValue: "April 27, 2016",
    expectedRowCount: 1,
    expectedTableData: {
      columns: ["ID", "Datetime"],
      firstRows: [["36", "April 26, 2016"]],
    },
  },
  {
    name: "DatetimeExpression",
    expression: "date(dateTimeAdd([Created At], 1, 'day'))",
    filterOperator: "Before",
    filterValue: "April 28, 2016",
    expectedRowCount: 1,
    expectedTableData: {
      columns: ["ID", "DatetimeExpression"],
      firstRows: [["36", "April 27, 2016"]],
    },
  },
];

const DATETIME_STRING_TEST_CASES: CastTestCase[] = [
  {
    name: "String",
    expression: 'datetime("2025-03-20 12:03")',
    filterOperator: "On",
    filterValue: "March 20, 2025|12:03",
    expectedRowCount: 200,
  },
  {
    name: "StringExpression",
    expression:
      'datetime(concat("2025-03-", case([ID] = 1, "10", "12"), " 12:03"))',
    filterOperator: "Before",
    filterValue: "March 11, 2025|12:03",
    expectedRowCount: 1,
  },
  {
    name: "StringExpressionWithIsoMode",
    expression:
      'datetime(concat("2025-03-", case([ID] = 1, "10", "12"), " 12:03"), "iso")',
    filterOperator: "Before",
    filterValue: "March 11, 2025|12:03",
    expectedRowCount: 1,
  },
  {
    name: "StringWithIsoMode",
    expression: 'datetime("2025-03-20 12:03", "iso")',
    filterOperator: "On",
    filterValue: "March 20, 2025|12:03",
    expectedRowCount: 200,
  },
  {
    name: "StringWithSimpleMode",
    expression: 'datetime("20250320120300", "simple")',
    filterOperator: "On",
    filterValue: "March 20, 2025|12:03",
    expectedRowCount: 200,
  },
  {
    name: "StringExpressionWithSimpleMode",
    expression:
      'datetime(concat("202503", case([ID] = 1, "10", "12"), "120300"), "simple")',
    filterOperator: "Before",
    filterValue: "March 11, 2025|12:03",
    expectedRowCount: 1,
  },
];

const DATETIME_NUMBER_TEST_CASES: CastTestCase[] = [
  {
    name: "NumberUnixSeconds",
    expression: 'datetime(1741694580, "unixSeconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
  {
    name: "NumberUnixMilliseconds",
    expression: 'datetime(1741694580000, "unixMilliseconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
  {
    name: "NumberUnixMicroseconds",
    expression: 'datetime(1741694580000000, "unixMicroseconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
  {
    name: "NumberUnixNanoseconds",
    expression: 'datetime(1741694580000000000, "unixNanoseconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },

  {
    name: "NumberUnixSecondsExpression",
    expression: 'datetime(1741694580 * 1, "unixSeconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
  {
    name: "NumberUnixMillisecondsExpression",
    expression: 'datetime(1741694580 * 1000, "unixMilliseconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
  {
    name: "NumberUnixMicrosecondsExpression",
    expression: 'datetime(1741694580000000 * 1, "unixMicroseconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
  {
    name: "NumberUnixNanosecondsExpression",
    expression: 'datetime(1741694580 * 1000000000, "unixNanoseconds")',
    filterOperator: "On",
    filterValue: "March 11, 2025",
    expectedRowCount: 200,
  },
];

const FLOAT_TEST_CASES: CastTestCase[] = [
  {
    name: "Float",
    expression: 'float("12.5")',
    filterOperator: "Equal to",
    filterValue: "12.5",
    expectedRowCount: 200,
  },
  {
    name: "FloatExpression",
    expression: 'float(concat([ID], ".3333"))',
    filterOperator: "Less than",
    filterValue: "2",
    expectedRowCount: 1,
  },
];

describe(
  "scenarios > custom column > cast functions",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
    });

    it("should support text function", () => {
      testFilterWithExpressions(TEXT_TEST_CASES, addOperatorFilter);
    });

    it("should support integer function", () => {
      testFilterWithExpressions(INTEGER_TEST_CASES, addOperatorFilter);
    });

    it("should support float function", () => {
      testFilterWithExpressions(FLOAT_TEST_CASES, addOperatorFilter);
    });

    it("should support date function", () => {
      testFilterWithExpressions(DATE_TEST_CASES, addDateFilter);
    });

    it("should support datetime function on strings", () => {
      testFilterWithExpressions(DATETIME_STRING_TEST_CASES, addDateTimeFilter);
    });

    it("should support datetime function on numbers", () => {
      testFilterWithExpressions(DATETIME_NUMBER_TEST_CASES, addDateFilter);
    });
  },
);

describe("exercise binary datetime() cast function", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  const tests = [
    {
      query: "SELECT CAST('2024-05-21 10:10:03' AS bytea) AS date_time",
      expression: 'datetime([date_time], "isobytes")',
    },
    {
      query: "SELECT CAST('20240521101003' AS bytea) AS date_time",
      expression: 'datetime([date_time], "simplebytes")',
    },
  ];

  tests.forEach((test) => {
    it(`should correctly convert temporal bytes: ${test.expression}`, () => {
      H.createNativeQuestion(
        {
          native: {
            query: test.query,
          },
        },
        { wrapId: true },
      ).then((id) => {
        H.visitQuestionAdhoc(
          {
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": `card__${id}`,
              },
            },
          },
          { mode: "notebook" },
        );
      });

      addCustomColumn({
        name: "parsed_date",
        expression: test.expression,
      });

      H.visualize();

      cy.findAllByTestId("header-cell")
        .eq(1)
        .should("have.text", "parsed_date");
      cy.findAllByTestId("cell-data")
        .eq(3)
        .should("have.text", "May 21, 2024, 10:10 AM");
    });
  });
});

describe("exercise today() function", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should show today's date", () => {
    startNewQuestion();
    removeTableFields();
    H.visualize();
    H.assertQueryBuilderRowCount(200);
    H.openNotebook();

    addCustomColumn({
      name: "TODAY",
      expression: "today()",
    });

    const today = new Date();
    const dateString = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    H.visualize();
    cy.findAllByTestId("header-cell").eq(1).should("have.text", "TODAY");
    cy.findAllByTestId("cell-data").eq(3).should("have.text", dateString);
  });
});

function startNewQuestion() {
  H.startNewQuestion();
  H.miniPicker().within(() => {
    cy.findByText("QA Postgres12").click();
    cy.findByText("Products").click();
  });
}

function removeTableFields() {
  H.getNotebookStep("data").button("Pick columns").click();
  H.popover().findByText("Select all").click();
  cy.realPress("Escape");
}

function addCustomColumn({
  name,
  expression,
}: {
  name: string;
  expression: string;
}) {
  H.getNotebookStep("data").button("Custom column").click();
  H.enterCustomColumnDetails({ formula: expression, name });
  H.popover().button("Done").click();
}

function removeCustomColumn({ name }: CastTestCase) {
  H.getNotebookStep("expression").findByText(name).icon("close").click();
}

function addOperatorFilter({ filterOperator, filterValue }: CastTestCase) {
  H.selectFilterOperator(filterOperator);
  H.popover().within(() => {
    cy.findByLabelText("Filter value").type(filterValue);
    cy.button("Add filter").click();
  });
}

function addDateFilter({ filterOperator, filterValue }: CastTestCase) {
  H.popover().within(() => {
    cy.findByText("Fixed date range…").click();
    cy.findByText(filterOperator).click();
    cy.findByLabelText("Date").clear().type(filterValue);
    cy.button("Add filter").click();
  });
}

function addDateTimeFilter({ filterOperator, filterValue }: CastTestCase) {
  const [dateValue, timeValue] = filterValue.split("|");
  H.popover().within(() => {
    cy.findByText("Fixed date range…").click();
    cy.findByText(filterOperator).click();
    cy.findByLabelText("Date").clear().type(dateValue);
    cy.findByText("Add time").click();
    cy.findByLabelText("Time").clear().type(timeValue);
    cy.button("Add filter").click();
  });
}

function testFilterWithExpressions(
  testCases: CastTestCase[],
  addFilter: (testCase: CastTestCase) => void,
) {
  startNewQuestion();
  removeTableFields();
  H.visualize();
  H.assertQueryBuilderRowCount(200);
  H.openNotebook();

  testCases.forEach((testCase) => {
    cy.log(testCase.name);
    addCustomColumn(testCase);
    H.getNotebookStep("expression").button("Filter").click();
    H.popover().findByText(testCase.name).click();
    addFilter(testCase);
    H.visualize();
    H.assertQueryBuilderRowCount(testCase.expectedRowCount);

    if (testCase.expectedTableData) {
      // @ts-expect-error: assertTableData is not typed
      H.assertTableData(testCase.expectedTableData);
    }

    H.openNotebook();
    removeCustomColumn(testCase);
  });
}

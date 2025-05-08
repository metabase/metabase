const { H } = cy;

type CastTestCase = {
  name: string;
  expression: string;
  filterOperator: string;
  filterValue: string;
  expectedRowCount: number;
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
  },
);

function startNewQuestion() {
  H.startNewQuestion();
  H.entityPickerModal().within(() => {
    H.entityPickerModalTab("Tables").click();
    cy.findByText("QA Postgres12").click();
    cy.findByText("Products").click();
  });
}

function removeTableFields() {
  H.getNotebookStep("data").button("Pick columns").click();
  H.popover().findByText("Select all").click();
  cy.realPress("Escape");
}

function addCustomColumn({ name, expression }: CastTestCase) {
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
    H.openNotebook();
    removeCustomColumn(testCase);
  });
}

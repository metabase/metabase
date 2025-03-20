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
      testCastFunction(TEXT_TEST_CASES);
    });

    it("should support integer function", () => {
      testCastFunction(INTEGER_TEST_CASES);
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

function removeCustomColumn({ name }: { name: string }) {
  H.getNotebookStep("expression").findByText(name).icon("close").click();
}

function addFilter({
  column,
  operator,
  value,
}: {
  column: string;
  operator: string;
  value: string;
}) {
  H.getNotebookStep("expression").button("Filter").click();
  H.popover().findByText(column).click();
  H.selectFilterOperator(operator);
  H.popover().within(() => {
    cy.findByLabelText("Filter value").type(value);
    cy.button("Add filter").click();
  });
}

function testCastFunction(testCases: CastTestCase[]) {
  startNewQuestion();
  removeTableFields();
  H.visualize();
  H.assertQueryBuilderRowCount(200);
  H.openNotebook();

  testCases.forEach(testCase => {
    cy.log(testCase.name);
    addCustomColumn({
      name: testCase.name,
      expression: testCase.expression,
    });
    addFilter({
      column: testCase.name,
      operator: testCase.filterOperator,
      value: testCase.filterValue,
    });
    H.visualize();
    H.assertQueryBuilderRowCount(testCase.expectedRowCount);
    H.openNotebook();
    removeCustomColumn({ name: testCase.name });
  });
}

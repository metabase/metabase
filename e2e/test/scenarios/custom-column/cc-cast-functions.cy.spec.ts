const { H } = cy;

describe(
  "scenarios > custom column > cast functions",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsNormalUser();
    });

    it("should support text function", () => {
      const testCases = [
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
        H.getNotebookStep("data").button("Pick columns").click();
      }

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
        addStringFilter({
          column: testCase.name,
          operator: testCase.filterOperator,
          value: testCase.filterValue,
        });
        H.visualize();
        H.assertQueryBuilderRowCount(testCase.expectedRowCount);
        H.openNotebook();
        removeCustomColumn({ name: testCase.name });
      });
    });
  },
);

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

function addStringFilter({
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

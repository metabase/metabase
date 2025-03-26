const { H } = cy;

describe.skip("scenarios > custom column > literals", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support literals in custom columns", () => {
    const columns = [
      { name: "True", expression: "True", value: "true" },
      { name: "False", expression: "False", value: "false" },
      { name: "Zero", expression: "0", value: "0" },
      { name: "Number", expression: "10", value: "10" },
      { name: "String", expression: '"abc"', value: "abc" },
      { name: "DateString", expression: '"2024-01-01"', value: "2024-01-01" },
      {
        name: "DateTimeString",
        expression: '"2024-01-01T10:20:00"',
        value: "2024-01-01T10:20:00",
      },
      { name: "TimeString", expression: '"10:20"', value: "10:20" },
      { name: "Column", expression: "[Number]", value: "10" },
      { name: "Expression", expression: "[Number] + [Number]", value: "20" },
    ];

    function removeTableFields() {
      H.getNotebookStep("data").button("Pick columns").click();
      H.popover().findByText("Select all").click();
      H.getNotebookStep("data").button("Pick columns").click();
    }

    H.openProductsTable({ mode: "notebook" });
    removeTableFields();
    addCustomColumns(columns);
    H.visualize();
    H.assertTableData({
      columns: ["ID", ...columns.map(({ name }) => name)],
      firstRows: [["1", ...columns.map(({ value }) => value)]],
    });
  });

  it("should support literals in filters", () => {
    const columns = [
      { name: "TrueColumn", expression: "True" },
      { name: "FalseColumn", expression: "False" },
    ];

    function testFilterLiteral({
      filterExpression,
      filterDisplayName,
      expectedRowCount,
    }: {
      filterExpression: string;
      filterDisplayName: string;
      expectedRowCount: number;
    }) {
      cy.log("add filter");
      H.getNotebookStep("expression").button("Filter").click();
      H.popover().findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: filterExpression,
      });
      H.popover().button("Done").click();

      cy.log("assert expression");
      H.getNotebookStep("filter").findByText(filterDisplayName).click();
      H.CustomExpressionEditor.value().should("eq", filterExpression);
      cy.realPress("Escape");

      cy.log("assert query results");
      H.visualize();
      H.assertQueryBuilderRowCount(expectedRowCount);
      H.openNotebook();
      H.getNotebookStep("filter")
        .findByText(filterDisplayName)
        .icon("close")
        .click();
    }

    H.openProductsTable({ mode: "notebook" });
    addCustomColumns(columns);
    testFilterLiteral({
      filterExpression: "False",
      filterDisplayName: "false",
      expectedRowCount: 0,
    });
    testFilterLiteral({
      filterExpression: "True",
      filterDisplayName: "true",
      expectedRowCount: 200,
    });
    testFilterLiteral({
      filterExpression: "[TrueColumn]",
      filterDisplayName: "TrueColumn",
      expectedRowCount: 200,
    });
    testFilterLiteral({
      filterExpression: "[FalseColumn]",
      filterDisplayName: "FalseColumn",
      expectedRowCount: 0,
    });
  });

  it("should support custom columns with literal values used in other clauses", () => {
    H.openProductsTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({ name: "Column", formula: "10" });
    H.popover().button("Done").click();
    H.getNotebookStep("expression").button("Filter").click();
    H.popover().within(() => {
      cy.findByText("Column").click();
      cy.findByPlaceholderText("Min").type("5");
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter").button("Summarize").click();
    H.popover().within(() => {
      cy.findByText("Average of ...").click();
      cy.findByText("Column").click();
    });
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByText("Column").click();
    H.getNotebookStep("summarize").button("Sort").click();
    H.popover().findByText("Column").click();
    H.visualize();
    H.assertTableData({
      columns: ["Column", "Average of Column"],
      firstRows: [["10", "10"]],
    });
  });
});

type CustomColumnInfo = { name: string; expression: string };

function addCustomColumns(columns: CustomColumnInfo[]) {
  columns.forEach(({ name, expression }, index) => {
    if (index === 0) {
      H.getNotebookStep("data").button("Custom column").click();
    } else {
      H.getNotebookStep("expression").icon("add").click();
    }
    H.enterCustomColumnDetails({ formula: expression, name });
    H.popover().button("Done").click();
    H.getNotebookStep("expression").findByText(name).click();
    H.CustomExpressionEditor.value().should("eq", expression);
    cy.realPress("Escape");
  });
}

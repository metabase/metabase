const { H } = cy;

describe("scenarios > custom column > literals", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support literals in custom columns", () => {
    const columns = [
      { name: "True", expression: "True", value: "true" },
      // { name: "false", expression: "False", value: "false" },
      { name: "Text", expression: '"abc"', value: "abc" },
      { name: "Number", expression: "10", value: "10" },
      { name: "Column", expression: "[Number]", value: "10" },
      { name: "Expression", expression: "[Number] + [Number]", value: "20" },
    ];

    function removeTableFields() {
      H.getNotebookStep("data").button("Pick columns").click();
      H.popover().findByText("Select all").click();
      H.getNotebookStep("data").button("Pick columns").click();
    }

    function addCustomColumns() {
      columns.forEach(({ name, expression }, index) => {
        if (index === 0) {
          H.getNotebookStep("data").button("Custom column").click();
        } else {
          H.getNotebookStep("expression").icon("add").click();
        }
        H.enterCustomColumnDetails({ formula: expression, name });
        H.popover().button("Done").click();
      });
    }

    H.openProductsTable({ mode: "notebook" });
    removeTableFields();
    addCustomColumns();
    H.visualize();
    H.assertTableData({
      columns: ["ID", ...columns.map(({ name }) => name)],
      firstRows: [["1", ...columns.map(({ value }) => value)]],
    });
  });

  it("should support literals in filters", () => {
    function testFilterLiteral({
      filterExpression,
      filterDisplayName,
      expectedRowCount,
    }: {
      filterExpression: string;
      filterDisplayName: string;
      expectedRowCount: number;
    }) {
      H.getNotebookStep("data").button("Filter").click();
      H.popover().findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: filterExpression,
      });
      H.popover().button("Done").click();
      H.visualize();
      H.assertQueryBuilderRowCount(expectedRowCount);
      H.openNotebook();
      H.getNotebookStep("filter")
        .findByText(filterDisplayName)
        .icon("close")
        .click();
    }

    H.openProductsTable({ mode: "notebook" });
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
  });
});

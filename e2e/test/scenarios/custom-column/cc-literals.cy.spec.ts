const { H } = cy;

describe("scenarios > custom column > literals", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support literals in custom columns", () => {
    function removeTableFields() {
      H.getNotebookStep("data").button("Pick columns").click();
      H.popover().findByText("Select all").click();
    }

    function addCustomColumn({
      expression,
      name,
      isFirst,
    }: {
      expression: string;
      name: string;
      isFirst?: boolean;
    }) {
      if (isFirst) {
        H.getNotebookStep("data").button("Custom column").click();
      } else {
        H.getNotebookStep("expression").icon("add").click();
      }
      H.enterCustomColumnDetails({ formula: expression, name });
      H.popover().button("Done").click();
    }

    H.openProductsTable({ mode: "notebook" });
    removeTableFields();
    addCustomColumn({ expression: "True", name: "True" });
    addCustomColumn({ expression: "False", name: "False" });
    addCustomColumn({ expression: "10", name: "Number" });
    addCustomColumn({ expression: '"abc"', name: "Text" });
    addCustomColumn({ expression: "[Number]", name: "Value" });
    addCustomColumn({ expression: "[Number] + [Number]", name: "Expression" });
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

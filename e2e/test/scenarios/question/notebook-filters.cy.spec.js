import {
  filter,
  getNotebookStep,
  popover,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const tableQuestion = {
  display: "table",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PRODUCTS_ID,
    },
  },
};

describe("scenarios > question > notebook filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("table source", () => {
    describe("string columns", () => {
      it("equals operator", () => {
        visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Is",
          options: ["Aerodynamic Concrete Lamp"],
          filterName: "Title is Aerodynamic Concrete Lamp",
          rowCount: 1,
        });
      });

      it("equals operator with multiple options", () => {
        visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Is",
          options: ["Aerodynamic Concrete Lamp", "Aerodynamic Cotton Bottle"],
          filterName: "Title is 2 selections",
          rowCount: 2,
        });
      });

      it("not equals operator", () => {
        visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
        addFilterAndVerify({
          column: "Category",
          operator: "Is not",
          options: ["Widget"],
          filterName: "Category is not Widget",
          rowCount: 146,
        });
      });
    });
  });
});

function addFilterAndVerify({
  column,
  operator,
  value,
  placeholder,
  options = [],
  filterName,
  rowCount,
}) {
  filter({ mode: "notebook" });
  popover().findByText(column).click();
  popover().findByDisplayValue("Is").click();
  cy.findByRole("listbox").findByText(operator).click();
  if (value) {
    popover().findByPlaceholderText(placeholder).type(value);
  } else {
    options.forEach(option => popover().findByText(option).click());
  }
  popover().button("Add filter").click();
  getNotebookStep("filter").findByText(filterName).should("be.visible");
  visualize();
  verifyRowCount(rowCount);
}

function verifyRowCount(rowCount) {
  const rowWord = rowCount === 1 ? "row" : "rows";

  cy.findByTestId("view-footer")
    .findByText(`Showing ${rowCount} ${rowWord}`)
    .should("be.visible");
}

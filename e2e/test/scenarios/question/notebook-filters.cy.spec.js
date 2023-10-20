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
        filter({ mode: "notebook" });
        selectColumn("Title");
        toggleOption("Aerodynamic Concrete Lamp");
        addFilter();
        verifyFilterName("Title is Aerodynamic Concrete Lamp");
        visualize();
        verifyRowCount(1);
      });

      it("not equals operator", () => {
        visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
        filter({ mode: "notebook" });
        selectColumn("Title");
        selectOperator("Is", "Is not");
        toggleOption("Aerodynamic Concrete Lamp");
        addFilter();
        verifyFilterName("Title is not Aerodynamic Concrete Lamp");
        visualize();
        verifyRowCount(199);
      });

      it("contains operator", () => {
        visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
        filter({ mode: "notebook" });
        selectColumn("Title");
        selectOperator("Is", "Contains");
        enterValue("Enter some text", "hat");
        addFilter();
        verifyFilterName("Title contains hat");
        visualize();
        verifyRowCount(12);
      });
    });
  });
});

function selectColumn(columnName) {
  popover().findByText(columnName).click();
}

function selectOperator(oldOperatorName, newOperatorName) {
  popover().findByDisplayValue(oldOperatorName).click();
  cy.findByRole("listbox").findByText(newOperatorName).click();
}

function toggleOption(optionName) {
  popover().findByText(optionName).click();
}

function enterValue(placeholder, value) {
  cy.findByPlaceholderText(placeholder).clear().type(value);
}

function addFilter() {
  popover().button("Add filter").click();
}

function verifyFilterName(filterName) {
  getNotebookStep("filter").findByText(filterName).should("be.visible");
}

function verifyRowCount(rowCount) {
  const rowWord = rowCount === 1 ? "row" : "rows";

  cy.findByTestId("view-footer")
    .findByText(`Showing ${rowCount} ${rowWord}`)
    .should("be.visible");
}

import {
  filter,
  getNotebookStep,
  openProductsTable,
  popover,
  restore,
  visualize,
} from "e2e/support/helpers";

describe("scenarios > question > notebook filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("table source", () => {
    describe("string columns", () => {
      it("equals operator", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Is",
          options: ["Aerodynamic Concrete Lamp"],
          filterName: "Title is Aerodynamic Concrete Lamp",
          rowCount: 1,
        });
      });

      it("equals operator with multiple options", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Is",
          options: ["Aerodynamic Concrete Lamp", "Aerodynamic Cotton Bottle"],
          filterName: "Title is 2 selections",
          rowCount: 2,
        });
      });

      it("not equals operator", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Category",
          operator: "Is not",
          options: ["Widget"],
          filterName: "Category is not Widget",
          rowCount: 146,
        });
      });

      it("not equals operator with multiple options", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Category",
          operator: "Is not",
          options: ["Widget", "Gadget"],
          filterName: "Category is not 2 selections",
          rowCount: 93,
        });
      });

      it("contains operator", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Contains",
          placeholder: "Enter some text",
          value: "Al",
          filterName: "Title contains Al",
          rowCount: 47,
        });
      });

      it("contains operator with case sensitive option", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Contains",
          placeholder: "Enter some text",
          value: "Al",
          caseSensitive: true,
          filterName: "Title contains Al",
          rowCount: 16,
        });
      });

      it("does not contain operator", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Does not contain",
          placeholder: "Enter some text",
          value: "Al",
          filterName: "Title does not contain Al",
          rowCount: 153,
        });
      });

      it("does not contain operator with case sensitive option", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Does not contain",
          placeholder: "Enter some text",
          value: "Al",
          caseSensitive: true,
          filterName: "Title does not contain Al",
          rowCount: 184,
        });
      });

      it("starts with operator", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Starts with",
          placeholder: "Enter some text",
          value: "AE",
          filterName: "Title starts with AE",
          rowCount: 14,
        });
      });

      it("starts with operator with case sensitive option", () => {
        openProductsTable({ mode: "notebook" });
        addFilterAndVerify({
          column: "Title",
          operator: "Starts with",
          placeholder: "Enter some text",
          value: "AE",
          caseSensitive: true,
          filterName: "Title starts with AE",
          rowCount: 0,
        });
      });
    });
  });
});

function addFilterAndVerify({
  column,
  operator,
  placeholder,
  value,
  options = [],
  caseSensitive = false,
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
  if (caseSensitive) {
    popover().findByText("Case sensitive").click();
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

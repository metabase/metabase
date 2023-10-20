import {
  filter,
  getNotebookStep,
  openProductsTable,
  popover,
  restore,
  visualize,
} from "e2e/support/helpers";

const TEST_CASES = [
  {
    title: "string, is",
    column: "Category",
    operator: "Is",
    options: ["Widget"],
    expectedDisplayName: "Category is Widget",
    expectedRowCount: 54,
  },
];

describe("scenarios > question > notebook filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("table source", () => {
    TEST_CASES.forEach(
      ({
        title,
        column,
        operator,
        values = [],
        options,
        expectedDisplayName,
        expectedRowCount,
      }) => {
        it(title, () => {
          openProductsTable({ mode: "notebook" });
          filter({ mode: "notebook" });

          popover().within(() => {
            cy.findByText(column).click();
            cy.findByDisplayValue("Is").click();
          });
          cy.findByRole("listbox").findByText(operator).click();
          popover().within(() => {
            values.forEach(value => cy.findByRole("textbox").type(value));
            options.forEach(option => cy.findByText(option).click());
            cy.button("Add filter").click();
          });

          getNotebookStep("filter")
            .findByText(expectedDisplayName)
            .should("be.visible");
          visualize();
          cy.findByTestId("question-row-count").should(
            "contain",
            `Showing ${expectedRowCount} row`,
          );
        });
      },
    );
  });
});

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
  {
    title: "string, is, multiple options",
    column: "Category",
    operator: "Is",
    options: ["Widget", "Gadget"],
    expectedDisplayName: "Category is 2 selections",
    expectedRowCount: 107,
  },
  {
    title: "string, is not",
    column: "Category",
    operator: "Is not",
    options: ["Widget"],
    expectedDisplayName: "Category is not Widget",
    expectedRowCount: 146,
  },
  {
    title: "string, contains",
    column: "Title",
    operator: "Contains",
    values: ["Al"],
    expectedDisplayName: "Title contains Al",
    expectedRowCount: 47,
  },
  {
    title: "string, contains, case sensitive",
    column: "Title",
    operator: "Contains",
    values: ["Al"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title contains Al",
    expectedRowCount: 16,
  },
  {
    title: "string, does not contain",
    column: "Title",
    operator: "Does not contain",
    values: ["Al"],
    expectedDisplayName: "Title does not contain Al",
    expectedRowCount: 153,
  },
  {
    title: "string, does not contain, case sensitive",
    column: "Title",
    operator: "Does not contain",
    values: ["Al"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title does not contain Al",
    expectedRowCount: 184,
  },
  {
    title: "string, starts with",
    column: "Title",
    operator: "Starts with",
    values: ["sm"],
    expectedDisplayName: "Title starts with sm",
    expectedRowCount: 11,
  },
  {
    title: "string, starts with, case sensitive",
    column: "Title",
    operator: "Starts with",
    values: ["Sm"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title starts with Sm",
    expectedRowCount: 11,
  },
  {
    title: "string, ends with",
    column: "Title",
    operator: "Ends with",
    values: ["At"],
    expectedDisplayName: "Title ends with At",
    expectedRowCount: 22,
  },
  {
    title: "string, ends with, case sensitive",
    column: "Title",
    operator: "Ends with",
    values: ["At"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title ends with At",
    expectedRowCount: 0,
  },
  {
    title: "string, is empty",
    column: "Title",
    operator: "Is empty",
    expectedDisplayName: "Title is empty",
    expectedRowCount: 0,
  },
  {
    title: "string, is not empty",
    column: "Title",
    operator: "Not empty",
    expectedDisplayName: "Title is not empty",
    expectedRowCount: 200,
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
        options = [],
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

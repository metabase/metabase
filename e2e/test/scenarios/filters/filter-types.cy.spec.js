import {
  assertQueryBuilderRowCount,
  filter,
  getNotebookStep,
  openProductsTable,
  popover,
  restore,
  visualize,
} from "e2e/support/helpers";

const STRING_CASES = [
  {
    title: "is",
    columnName: "Category",
    operator: "Is",
    options: ["Widget"],
    expectedDisplayName: "Category is Widget",
    expectedRowCount: 54,
  },
  {
    title: "is, multiple options",
    columnName: "Category",
    operator: "Is",
    options: ["Widget", "Gadget"],
    expectedDisplayName: "Category is 2 selections",
    expectedRowCount: 107,
  },
  {
    title: "is not",
    columnName: "Category",
    operator: "Is not",
    options: ["Widget"],
    expectedDisplayName: "Category is not Widget",
    expectedRowCount: 146,
  },
  {
    title: "contains",
    columnName: "Title",
    operator: "Contains",
    values: ["Al"],
    expectedDisplayName: "Title contains Al",
    expectedRowCount: 47,
  },
  {
    title: "contains, case sensitive",
    columnName: "Title",
    operator: "Contains",
    values: ["Al"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title contains Al",
    expectedRowCount: 16,
  },
  {
    title: "does not contain",
    columnName: "Title",
    operator: "Does not contain",
    values: ["Al"],
    expectedDisplayName: "Title does not contain Al",
    expectedRowCount: 153,
  },
  {
    title: "does not contain, case sensitive",
    columnName: "Title",
    operator: "Does not contain",
    values: ["Al"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title does not contain Al",
    expectedRowCount: 184,
  },
  {
    title: "starts with",
    columnName: "Title",
    operator: "Starts with",
    values: ["sm"],
    expectedDisplayName: "Title starts with sm",
    expectedRowCount: 11,
  },
  {
    title: "starts with, case sensitive",
    columnName: "Title",
    operator: "Starts with",
    values: ["Sm"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title starts with Sm",
    expectedRowCount: 11,
  },
  {
    title: "ends with",
    columnName: "Title",
    operator: "Ends with",
    values: ["At"],
    expectedDisplayName: "Title ends with At",
    expectedRowCount: 22,
  },
  {
    title: "ends with, case sensitive",
    columnName: "Title",
    operator: "Ends with",
    values: ["At"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title ends with At",
    expectedRowCount: 0,
  },
  {
    title: "is empty",
    columnName: "Title",
    operator: "Is empty",
    expectedDisplayName: "Title is empty",
    expectedRowCount: 0,
  },
  {
    title: "is not empty",
    columnName: "Title",
    operator: "Not empty",
    expectedDisplayName: "Title is not empty",
    expectedRowCount: 200,
  },
];

const NUMBER_CASES = [
  {
    title: "equal to",
    columnName: "Rating",
    operator: "Equal to",
    values: ["4"],
    expectedDisplayName: "Rating is equal to 4",
    expectedRowCount: 37,
  },
  {
    title: "equal to, multiple values",
    columnName: "Rating",
    operator: "Equal to",
    values: ["4", "5"],
    expectedDisplayName: "Rating is equal to 2 selections",
    expectedRowCount: 40,
  },
  {
    title: "not equal to",
    columnName: "Rating",
    operator: "Not equal to",
    values: ["4"],
    expectedDisplayName: "Rating is not equal to 4",
    expectedRowCount: 163,
  },
  {
    title: "greater than",
    columnName: "Price",
    operator: "Greater than",
    values: ["47.5"],
    expectedDisplayName: "Price is greater than 47.5",
    expectedRowCount: 111,
  },
  {
    title: "less than",
    columnName: "Price",
    operator: "Less than",
    values: ["47.5"],
    expectedDisplayName: "Price is less than 47.5",
    expectedRowCount: 89,
  },
  {
    title: "greater than or equal to",
    columnName: "Price",
    operator: "Greater than or equal to",
    values: ["47.5"],
    expectedDisplayName: "Price is greater than or equal to 47.5",
    expectedRowCount: 111,
  },
  {
    title: "less than or equal to",
    columnName: "Price",
    operator: "Less than or equal to",
    values: ["47.5"],
    expectedDisplayName: "Price is less than or equal to 47.5",
    expectedRowCount: 89,
  },
  {
    title: "is empty",
    columnName: "Price",
    operator: "Is empty",
    expectedDisplayName: "Price is empty",
    expectedRowCount: 0,
  },
  {
    title: "not empty",
    columnName: "Price",
    operator: "Not empty",
    expectedDisplayName: "Price is not empty",
    expectedRowCount: 200,
  },
];

const DATE_SHORTCUT_CASES = [
  {
    title: "today",
    shortcut: "Today",
    expectedDisplayName: "Created At is today",
  },
  {
    title: "yesterday",
    shortcut: "Yesterday",
    expectedDisplayName: "Created At is yesterday",
  },
  {
    title: "last week",
    shortcut: "Last week",
    expectedDisplayName: "Created At is in the previous week",
  },
  {
    title: "last 7 days",
    shortcut: "Last 7 days",
    expectedDisplayName: "Created At is in the previous 7 days",
  },
  {
    title: "last 30 days",
    shortcut: "Last 30 days",
    expectedDisplayName: "Created At is in the previous 30 days",
  },
  {
    title: "last month",
    shortcut: "Last month",
    expectedDisplayName: "Created At is in the previous month",
  },
  {
    title: "last 3 months",
    shortcut: "Last 3 months",
    expectedDisplayName: "Created At is in the previous 3 months",
  },
  {
    title: "last 12 months",
    shortcut: "Last 12 months",
    expectedDisplayName: "Created At is in the previous 12 months",
  },
];

describe("scenarios > filters > filter types", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("string filters", () => {
    STRING_CASES.forEach(
      ({
        title,
        columnName,
        operator,
        values = [],
        options = [],
        expectedDisplayName,
        expectedRowCount,
      }) => {
        it(title, () => {
          openProductsTable({ mode: "notebook" });
          filter({ mode: "notebook" });

          popover().findByText(columnName).click();
          selectOperator(operator);
          popover().within(() => {
            values.forEach((value, index) => {
              if (index !== 0) {
                cy.findByRole("textbox").type("{enter}");
              }
              cy.findByRole("textbox").type(value);
            });
            options.forEach(option => cy.findByText(option).click());
            cy.button("Add filter").click();
          });

          assertFilterName(expectedDisplayName);
          visualize();
          assertQueryBuilderRowCount(expectedRowCount);
        });
      },
    );
  });

  describe("number filters", () => {
    NUMBER_CASES.forEach(
      ({
        title,
        columnName,
        operator,
        values = [],
        expectedDisplayName,
        expectedRowCount,
      }) => {
        it(title, () => {
          openProductsTable({ mode: "notebook" });
          filter({ mode: "notebook" });

          popover().findByText(columnName).click();
          selectOperator(operator);
          popover().within(() => {
            values.forEach((value, index) => {
              if (index !== 0) {
                cy.findByRole("textbox").type("{enter}");
              }
              cy.findByRole("textbox").type(value);
            });
            cy.button("Add filter").click();
          });

          assertFilterName(expectedDisplayName);
          visualize();
          assertQueryBuilderRowCount(expectedRowCount);
        });
      },
    );
  });

  describe("date filters, shortcuts", () => {
    DATE_SHORTCUT_CASES.forEach(({ title, shortcut, expectedDisplayName }) => {
      it(title, () => {
        openProductsTable({ mode: "notebook" });
        filter({ mode: "notebook" });

        popover().within(() => {
          cy.findByText("Created At").click();
          cy.findByText(shortcut).click();
        });
        assertFilterName(expectedDisplayName);
        visualize();
        assertFiltersExist();
      });
    });
  });
});

function selectOperator(operatorName) {
  cy.findByLabelText("Filter operator").click();
  cy.findByRole("listbox").findByText(operatorName).click();
}

function assertFilterName(filterName, options) {
  getNotebookStep("filter", options)
    .findByText(filterName)
    .should("be.visible");
}

function assertFiltersExist() {
  cy.findByTestId("qb-filters-panel").should("be.visible");
}

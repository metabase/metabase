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

const TABLE_CASES = [
  {
    title: "string, is",
    tableId: PRODUCTS_ID,
    columnName: "Category",
    operator: "Is",
    options: ["Widget"],
    expectedDisplayName: "Category is Widget",
    expectedRowCount: 54,
  },
  {
    title: "string, is, multiple options",
    tableId: PRODUCTS_ID,
    columnName: "Category",
    operator: "Is",
    options: ["Widget", "Gadget"],
    expectedDisplayName: "Category is 2 selections",
    expectedRowCount: 107,
  },
  {
    title: "string, is not",
    tableId: PRODUCTS_ID,
    columnName: "Category",
    operator: "Is not",
    options: ["Widget"],
    expectedDisplayName: "Category is not Widget",
    expectedRowCount: 146,
  },
  {
    title: "string, contains",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Contains",
    values: ["Al"],
    expectedDisplayName: "Title contains Al",
    expectedRowCount: 47,
  },
  {
    title: "string, contains, case sensitive",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Contains",
    values: ["Al"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title contains Al",
    expectedRowCount: 16,
  },
  {
    title: "string, does not contain",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Does not contain",
    values: ["Al"],
    expectedDisplayName: "Title does not contain Al",
    expectedRowCount: 153,
  },
  {
    title: "string, does not contain, case sensitive",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Does not contain",
    values: ["Al"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title does not contain Al",
    expectedRowCount: 184,
  },
  {
    title: "string, starts with",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Starts with",
    values: ["sm"],
    expectedDisplayName: "Title starts with sm",
    expectedRowCount: 11,
  },
  {
    title: "string, starts with, case sensitive",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Starts with",
    values: ["Sm"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title starts with Sm",
    expectedRowCount: 11,
  },
  {
    title: "string, ends with",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Ends with",
    values: ["At"],
    expectedDisplayName: "Title ends with At",
    expectedRowCount: 22,
  },
  {
    title: "string, ends with, case sensitive",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Ends with",
    values: ["At"],
    options: ["Case sensitive"],
    expectedDisplayName: "Title ends with At",
    expectedRowCount: 0,
  },
  {
    title: "string, is empty",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Is empty",
    expectedDisplayName: "Title is empty",
    expectedRowCount: 0,
  },
  {
    title: "string, is not empty",
    tableId: PRODUCTS_ID,
    columnName: "Title",
    operator: "Not empty",
    expectedDisplayName: "Title is not empty",
    expectedRowCount: 200,
  },
];

const tableQuestion = tableId => ({
  dataset_query: {
    type: "query",
    query: { "source-table": tableId },
    database: SAMPLE_DB_ID,
  },
});

describe("scenarios > question > notebook filters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("table source", () => {
    TABLE_CASES.forEach(
      ({
        title,
        tableId,
        columnName,
        operator,
        values = [],
        options = [],
        expectedDisplayName,
        expectedRowCount,
      }) => {
        it(title, () => {
          visitQuestionAdhoc(tableQuestion(tableId), { mode: "notebook" });
          filter({ mode: "notebook" });

          popover().within(() => {
            cy.findByText(columnName).click();
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

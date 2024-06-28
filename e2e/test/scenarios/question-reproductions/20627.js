import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visualize,
  openOrdersTable,
  popover,
  entityPickerModal,
  entityPickerModalTab,
  enterCustomColumnDetails,
} from "e2e/support/helpers";

const { ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

const foreignKeyColumnName = "Surprisingly long and awesome Product ID";
const newTableName = "Products with a very long name";

describe("issue 20627", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    renameColumn(ORDERS.PRODUCT_ID, foreignKeyColumnName);
    renameTable(PRODUCTS_ID, newTableName);
  });

  it("nested queries should handle long column and/or table names (metabase#20627)", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText(newTableName).click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText(newTableName).click();

      cy.findByText("Category").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    visualize();

    cy.get("[data-testid=cell-data]")
      .should("contain", "Math")
      .and("contain", "Doohickey")
      .and("contain", "3,976");
  });
});

function renameColumn(columnId, name) {
  cy.request("PUT", `/api/field/${columnId}`, { display_name: name });
}

function renameTable(tableId, name) {
  cy.request("PUT", `/api/table/${tableId}`, { display_name: name });
}

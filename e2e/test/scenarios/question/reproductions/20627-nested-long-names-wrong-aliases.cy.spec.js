import {
  restore,
  openOrdersTable,
  popover,
  enterCustomColumnDetails,
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

const newColumnName = "Product ID with a very long name";
const newTableName = "Products with a very long name";

describe("issue 20627", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    renameColumn(ORDERS.PRODUCT_ID, newColumnName);
    renameTable(PRODUCTS_ID, newTableName);
  });

  it("nested queries should handle long column and/or table names (metabase#20627)", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(newTableName).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.contains(newTableName).click();

      cy.findByText("Category").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    visualize();

    cy.get(".cellData")
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

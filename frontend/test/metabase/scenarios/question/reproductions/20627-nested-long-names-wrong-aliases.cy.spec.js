import {
  restore,
  openOrdersTable,
  popover,
  enterCustomColumnDetails,
  visualize,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

    cy.findByText("Join data").click();
    cy.findByText(newTableName).click();

    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();

    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.contains(newTableName).click();

      cy.findByText("Category").click();
    });

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

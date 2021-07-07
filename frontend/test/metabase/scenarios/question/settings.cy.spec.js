import {
  browse,
  restore,
  openOrdersTable,
  visitQuestionAdhoc,
  popover,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";
const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

describe("scenarios > question > settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("column settings", () => {
    it("should allow you to remove a column and add two foreign columns", () => {
      // oddly specific test inspired by https://github.com/metabase/metabase/issues/11499

      // get a really wide window, so we don't need to mess with scrolling the table horizontally
      cy.viewport(1600, 800);

      openOrdersTable();
      cy.contains("Settings").click();

      // wait for settings sidebar to open
      cy.get(".border-right.overflow-x-hidden")
        .invoke("width")
        .should("be.gt", 350);

      cy.contains("Table options")
        .parents(".scroll-y")
        .first()
        .as("tableOptions");

      // remove Total column
      cy.get("@tableOptions")
        .contains("Total")
        .scrollIntoView()
        .nextAll(".Icon-close")
        .click();

      // Add people.category
      cy.get("@tableOptions")
        .contains("Category")
        .scrollIntoView()
        .nextAll(".Icon-add")
        .click();

      // wait a Category value to appear in the table, so we know the query completed
      cy.contains("Widget");

      // Add people.ean
      cy.get("@tableOptions")
        .contains("Ean")
        .scrollIntoView()
        .nextAll(".Icon-add")
        .click();

      // wait a Ean value to appear in the table, so we know the query completed
      cy.contains("8833419218504");

      // confirm that the table contains the right columns
      cy.get(".Visualization .TableInteractive").as("table");
      cy.get("@table").contains("Product → Category");
      cy.get("@table").contains("Product → Ean");
      cy.get("@table")
        .contains("Total")
        .should("not.exist");
    });

    it.skip("should preserve correct order of columns after column removal via sidebar (metabase#13455)", () => {
      cy.viewport(2000, 1200);
      // Orders join Products
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
                ],
                alias: "Products",
              },
            ],
          },
          database: 1,
        },
        display: "table",
      });

      cy.findByText("Settings").click();
      cy.findByText("Click and drag to change their order")
        .should("be.visible")
        .parent()
        .find(".cursor-grab")
        .as("sidebarColumns"); // Store all columns in an array

      cy.get("@sidebarColumns")
        .eq("12")
        .as("prod-category")
        .contains(/Products? → Category/);

      // Drag and drop this column between "Tax" and "Discount" (index 5 in @sidebarColumns array)
      cy.get("@prod-category")
        .trigger("mousedown", 0, 0, { force: true })
        .trigger("mousemove", 5, 5, { force: true })
        .trigger("mousemove", 0, -300, { force: true })
        .trigger("mouseup", 0, -300, { force: true });

      reloadResults();
      findColumnAtIndex("Products → Category", 5);
      // Remove "Total"
      cy.get("@sidebarColumns")
        .contains("Total")
        .closest(".cursor-grab")
        .find(".Icon-close")
        .click();
      reloadResults();
      cy.findByText("117.03").should("not.exist");
      // This click doesn't do anything, but simply allows the array to be updated (test gives false positive without this step)
      cy.findByText("Visible columns").click();
      findColumnAtIndex("Products → Category", 5);

      /**
       * Helper functions related to THIS test only
       */

      function reloadResults() {
        cy.icon("play")
          .last()
          .click();
      }

      function findColumnAtIndex(column_name, index) {
        cy.get("@sidebarColumns")
          .eq(index)
          .contains(column_name);
      }
    });

    it("should change to column formatting when sidebar is already open (metabase#16043)", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: { "source-table": ORDERS_ID },
          database: 1,
        },
      });

      cy.findByText("Settings").click(); // open settings sidebar
      cy.findByText("Table options"); // confirm it's open
      cy.get(".TableInteractive")
        .findByText("Subtotal")
        .click(); // open subtotal column header actions
      popover().within(() => cy.icon("gear").click()); // open subtotal column settings

      cy.findByText("Table options").should("not.exist"); // no longer displaying the top level settings
      cy.findByText("Column title"); // shows subtotal column settings
    });
  });

  describe("resetting state", () => {
    it("should reset modal state when navigating away", () => {
      // create a question and add it to a modal
      openOrdersTable();

      cy.contains("Save").click();
      cy.get(".ModalContent")
        .contains("button", "Save")
        .click();
      cy.contains("Yes please!").click();
      cy.contains("Orders in a dashboard").click();

      // create a new question to see if the "add to a dashboard" modal is still there
      browse().click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();

      // This next assertion might not catch bugs where the modal displays after
      // a quick delay. With the previous presentation of this bug, the modal
      // was immediately visible, so I'm not going to add any waits.
      cy.contains("Add this question to a dashboard").should("not.exist");
    });
  });
});

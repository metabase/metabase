import {
  browse,
  restore,
  openOrdersTable,
  openNavigationSidebar,
  visitQuestionAdhoc,
  popover,
  sidebar,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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
      cy.findByTestId("sidebar-left").invoke("width").should("be.gt", 350);

      cy.findByTestId("sidebar-content").as("tableOptions");

      cy.get("@tableOptions").contains("Add or remove columns").click();

      // remove Total column
      cy.get("@tableOptions").contains("Total").scrollIntoView().click();

      // Add people.category
      cy.get("@tableOptions").contains("Category").scrollIntoView().click();

      // wait a Category value to appear in the table, so we know the query completed
      cy.contains("Widget");

      // Add people.ean
      cy.get("@tableOptions").contains("Ean").scrollIntoView().click();

      // wait a Ean value to appear in the table, so we know the query completed
      cy.contains("8833419218504");

      // confirm that the table contains the right columns
      cy.get(".Visualization .TableInteractive").as("table");
      cy.get("@table").contains("Product → Category");
      cy.get("@table").contains("Product → Ean");
      cy.get("@table").contains("Total").should("not.exist");
    });

    it("should allow you to bulk add and remove columns", () => {
      // Need to increase the viewport size to count columns later in the test
      cy.viewport(2000, 1400);
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            limit: 5,
          },
          database: SAMPLE_DB_ID,
        },
        display: "table",
      });
      cy.findByText("Settings").click();

      cy.findByText("Add or remove columns").click();

      cy.findByText("People").siblings().contains("Select All").click();

      cy.findByText("Add or remove columns").click();

      getSidebarColumns().filter(":visible").should("have.length", 22);

      cy.findByText("Add or remove columns").click();

      cy.findByText("People").siblings().contains("Deselect All").click();

      cy.findByText("Add or remove columns").click();

      cy.icon("play").last().click();
      cy.wait(["@dataset", "@dataset"]);

      getSidebarColumns().filter(":visible").should("have.length", 9);
    });

    it("should preserve correct order of columns after column removal via sidebar (metabase#13455)", () => {
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
            limit: 5,
          },
          database: SAMPLE_DB_ID,
        },
        display: "table",
      });

      cy.findByText("Settings").click();

      getSidebarColumns()
        .eq("12")
        .as("prod-category")
        .contains(/Products? → Category/);

      // Drag and drop this column between "Tax" and "Discount" (index 6 in @sidebarColumns array)
      cy.get("@prod-category")
        .trigger("mousedown", 0, 0, { force: true })
        .trigger("mousemove", 5, 5, { force: true })
        .trigger("mousemove", 0, -300, { force: true })
        .trigger("mouseup", 0, -300, { force: true });

      reloadResults();

      findColumnAtIndex("Products → Category", 6);

      // Remove "Total"
      toggleColumn("Total");

      reloadResults();

      cy.findByText("117.03").should("not.exist");

      // This click doesn't do anything, but simply allows the array to be updated (test gives false positive without this step)
      cy.get("body").click("bottomRight");

      findColumnAtIndex("Products → Category", 6);

      // We need to do some additional checks. Please see:
      // https://github.com/metabase/metabase/pull/21338#pullrequestreview-928807257

      // Add "Address"
      toggleColumn("Address");
      //cy.findByText("Address").siblings(".Icon-add").click();

      // The result automatically load when adding new fields but two requests are fired.
      // Please see: https://github.com/metabase/metabase/pull/21338#discussion_r842816687
      cy.wait(["@dataset", "@dataset"]);

      findColumnAtIndex("User → Address", -1).as("user-address");

      // Move it one place up
      cy.get("@user-address")
        .trigger("mousedown", 0, 0, { force: true })
        .trigger("mousemove", 5, 5, { force: true })
        .trigger("mousemove", 0, -50, { force: true })
        .trigger("mouseup", 0, -50, { force: true });

      findColumnAtIndex("User → Address", -2);

      /**
       * Helper functions related to THIS test only
       */

      function reloadResults() {
        cy.icon("play").last().click();
      }

      function findColumnAtIndex(column_name, index) {
        return getSidebarColumns().eq(index).contains(column_name);
      }

      function toggleColumn(column_name) {
        sidebar().within(() => {
          cy.findByText("Add or remove columns").click();
          cy.findByText(column_name).click();
          cy.findByText("Add or remove columns").click();
        });
      }
    });

    it("should change to column formatting when sidebar is already open (metabase#16043)", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: { "source-table": ORDERS_ID },
          database: SAMPLE_DB_ID,
        },
      });

      cy.findByText("Settings").click(); // open settings sidebar
      cy.findByText("Table options"); // confirm it's open
      cy.get(".TableInteractive").findByText("Subtotal").click(); // open subtotal column header actions
      popover().within(() => cy.icon("gear").click()); // open subtotal column settings

      //cy.findByText("Table options").should("not.exist"); // no longer displaying the top level settings
      cy.findByText("Separator style"); // shows subtotal column settings

      cy.get(".TableInteractive").findByText("Created At").click(); // open created_at column header actions
      popover().within(() => cy.icon("gear").click()); // open created_at column settings
      cy.findByText("Date style"); // shows created_at column settings
    });

    it.skip("should respect renamed column names in the settings sidebar (metabase#18476)", () => {
      const newColumnTitle = "Pre-tax";

      const questionDetails = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: { "source-table": 2 },
          type: "query",
        },
        display: "table",
        visualization_settings: {
          column_settings: {
            [`["ref",["field",${ORDERS.SUBTOTAL},null]]`]: {
              column_title: newColumnTitle,
            },
          },
        },
      };

      visitQuestionAdhoc(questionDetails);

      cy.findByText(newColumnTitle);

      cy.findByTestId("viz-settings-button").click();

      sidebar().findByText(newColumnTitle);
    });

    it("should respect symbol settings for all currencies", () => {
      openOrdersTable();
      cy.contains("Settings").click();

      getSidebarColumns()
        .eq("4")
        .within(() => {
          cy.icon("ellipsis").click();
        });

      cy.findByText("Normal").click();
      cy.findByText("Currency").click();

      cy.findByText("US Dollar").click();
      cy.findByText("Bitcoin").click();

      cy.findByText("In every table cell").click();

      cy.findByText("₿2.07000000");
      cy.findByText("₿6.10000000");
    });
  });

  describe("resetting state", () => {
    it("should reset modal state when navigating away", () => {
      // create a question and add it to a modal
      openOrdersTable();

      cy.contains("Save").click();
      cy.get(".ModalContent").contains("button", "Save").click();
      cy.contains("Yes please!").click();
      cy.contains("Orders in a dashboard").click();
      cy.findByText("Cancel").click();

      // create a new question to see if the "add to a dashboard" modal is still there
      openNavigationSidebar();
      browse().click();
      cy.contains("Sample Database").click();
      cy.contains("Orders").click();

      // This next assertion might not catch bugs where the modal displays after
      // a quick delay. With the previous presentation of this bug, the modal
      // was immediately visible, so I'm not going to add any waits.
      cy.contains("Add this question to a dashboard").should("not.exist");
    });
  });
});

function getSidebarColumns() {
  return cy
    .findByText("Columns", { selector: "label" })
    .scrollIntoView()
    .should("be.visible")
    .parent()
    .find("[data-testid^=draggable-item]");
}

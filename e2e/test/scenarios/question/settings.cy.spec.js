import {
  browse,
  restore,
  openOrdersTable,
  openNavigationSidebar,
  visitQuestionAdhoc,
  popover,
  sidebar,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
      cy.findByTestId("viz-settings-button").click();

      // wait for settings sidebar to open
      cy.findByTestId("sidebar-left").invoke("width").should("be.gt", 350);

      cy.findByTestId("sidebar-content").as("tableOptions");

      // remove Total column
      cy.get("@tableOptions")
        .contains("Total")
        .scrollIntoView()
        .siblings("[data-testid$=hide-button]")
        .click();

      // Add people.category
      cy.get("@tableOptions")
        .contains("Category")
        .scrollIntoView()
        .siblings("[data-testid$=add-button]")
        .click();

      // wait a Category value to appear in the table, so we know the query completed
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Widget");

      // Add people.ean
      cy.get("@tableOptions")
        .contains("Ean")
        .scrollIntoView()
        .siblings("[data-testid$=add-button]")
        .click();

      // wait a Ean value to appear in the table, so we know the query completed
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("8833419218504");

      // confirm that the table contains the right columns
      cy.get(".Visualization .TableInteractive").as("table");
      cy.get("@table").contains("Product → Category");
      cy.get("@table").contains("Product → Ean");
      cy.get("@table").contains("Total").should("not.exist");
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
            limit: 5,
          },
          database: SAMPLE_DB_ID,
        },
        display: "table",
      });

      cy.findByTestId("viz-settings-button").click();

      getSidebarColumns()
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
      getSidebarColumns()
        .contains("Total")
        .closest("[data-testid^=draggable-item]")
        .find(".Icon-eye_outline")
        .click();

      reloadResults();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("117.03").should("not.exist");

      // This click doesn't do anything, but simply allows the array to be updated (test gives false positive without this step)
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Visible columns").click();

      findColumnAtIndex("Products → Category", 5);

      // We need to do some additional checks. Please see:
      // https://github.com/metabase/metabase/pull/21338#pullrequestreview-928807257

      // Add "Address"
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Address").siblings(".Icon-add").click();

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
    });

    it("should change to column formatting when sidebar is already open (metabase#16043)", () => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: { "source-table": ORDERS_ID },
          database: SAMPLE_DB_ID,
        },
      });

      cy.findByTestId("viz-settings-button").click(); // open settings sidebar
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Conditional Formatting"); // confirm it's open
      cy.get(".TableInteractive").findByText("Subtotal").click(); // open subtotal column header actions
      popover().icon("gear").click(); // open subtotal column settings

      //cy.findByText("Table options").should("not.exist"); // no longer displaying the top level settings
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Separator style"); // shows subtotal column settings

      cy.get(".TableInteractive").findByText("Created At").click(); // open created_at column header actions
      popover().icon("gear").click(); // open created_at column settings
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Date style"); // shows created_at column settings
    });

    it("should respect renamed column names in the settings sidebar (metabase#18476)", () => {
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(newColumnTitle);

      cy.findByTestId("viz-settings-button").click();

      sidebar().findByText(newColumnTitle);
    });

    it("should respect symbol settings for all currencies", () => {
      openOrdersTable();
      cy.findByTestId("viz-settings-button").click();

      getSidebarColumns()
        .eq("4")
        .within(() => {
          cy.icon("ellipsis").click();
        });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Normal").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Currency").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("US Dollar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Bitcoin").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("In every table cell").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("₿ 2.07");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("₿ 6.10");
    });
  });

  describe("resetting state", () => {
    it("should reset modal state when navigating away", () => {
      // create a question and add it to a modal
      openOrdersTable();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Save").click();
      cy.get(".ModalContent").contains("button", "Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Yes please!").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Orders in a dashboard").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Cancel").click();

      // create a new question to see if the "add to a dashboard" modal is still there
      openNavigationSidebar();
      browse().click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Sample Database").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Orders").click();

      // This next assertion might not catch bugs where the modal displays after
      // a quick delay. With the previous presentation of this bug, the modal
      // was immediately visible, so I'm not going to add any waits.
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

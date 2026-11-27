const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > settings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("column settings", () => {
    it("should allow you to remove a column and add two foreign columns", () => {
      // oddly specific test inspired by https://github.com/metabase/metabase/issues/11499

      // get a really wide window, so we don't need to mess with scrolling the table horizontally
      cy.viewport(1600, 800);

      H.openOrdersTable();
      H.openVizSettingsSidebar();

      // wait for settings sidebar to open
      cy.findByTestId("sidebar-left").invoke("width").should("be.gt", 350);

      cy.findByTestId("sidebar-content").as("tableOptions");
      H.tableInteractive().contains("Total");

      cy.findByRole("button", { name: "Add or remove columns" }).click();

      // remove Total column
      cy.get("@tableOptions")
        .findByLabelText("Total")
        .should("be.checked")
        .click();

      // Add people.category
      cy.get("@tableOptions")
        .findByLabelText("Category")
        .should("not.be.checked")
        .click();

      // wait a Category value to appear in the table, so we know the query completed
      cy.findByTestId("visualization-root").contains("Widget");

      // Add people.ean
      cy.get("@tableOptions")
        .findByLabelText("Ean")
        .should("not.be.checked")
        .click();

      // wait a Ean value to appear in the table, so we know the query completed
      cy.findByTestId("visualization-root").contains("8833419218504");

      // confirm that the table contains the right columns
      H.tableInteractive().as("table");
      cy.get("@table").contains("Product → Category");
      cy.get("@table").contains("Product → Ean");
      cy.get("@table").contains("Total").should("not.exist");
    });

    it("should scroll the column list while a column is dragged (metabase#29287)", () => {
      // jsdom has no layout and no scrolling, so the auto-scroll is tested here
      cy.viewport(1600, 800);

      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                alias: "Products",
                "source-table": PRODUCTS_ID,
                strategy: "left-join",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, {}],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
              },
            ],
          },
          type: "query",
        },
      });
      H.openVizSettingsSidebar();

      getVisibleSidebarColumns()
        .eq(11)
        .as("title")
        .should("have.text", "Products → Title");

      cy.findByTestId("chartsettings-list-container").scrollTo("top");
      cy.findByTestId("chartsettings-list-container").should(([$el]) => {
        expect($el.scrollTop).to.eql(0);
      });

      H.moveDnDKitElementByAlias("@title", {
        vertical: 15,
        useMouseEvents: true,
      });

      cy.findByTestId("chartsettings-list-container").should(([$el]) => {
        expect($el.scrollTop).to.be.greaterThan(0);
      });
    });

    // The checks below are about layout: an icon pushed out of a column item
    // by a long name. jsdom has no layout, so they need a browser.
    it("should show all options without text overflowing", () => {
      const longName =
        "SuperLongColumnNameSuperLongColumnNameSuperLongColumnNameSuperLongColumnNameSuperLongColumnName";
      H.createNativeQuestion(
        {
          name: "Orders Model",
          native: {
            query: `SELECT total as "${longName}" FROM ORDERS`,
          },
        },
        { visitQuestion: true },
      );

      H.openVizSettingsSidebar();

      H.sidebar()
        .findByRole("listitem")
        .within(() => {
          cy.findByLabelText("ellipsis icon").should("be.visible");
          cy.findByLabelText("eye_outline icon").should("be.visible");
          cy.findByText(longName).should("be.visible");
        });
    });

    it("should show all series settings without text overflowing (metabase#52975)", () => {
      const regularColumnName = "regular column";
      const longColumnName1 =
        "very very very very very very very very very very very long column 1";
      const longColumnName2 =
        "very very very very very very very very very very very long column 2";

      H.createNativeQuestion(
        {
          name: "52975",
          native: {
            query: `select 'foo' x, 10 "${regularColumnName}", 20 "${longColumnName1}", 20 "${longColumnName2}"`,
          },
          display: "bar",
        },
        { visitQuestion: true },
      );

      H.openVizSettingsSidebar();

      H.sidebar()
        .findAllByTestId("chartsettings-field-picker")
        .eq(3)
        .within(() => {
          cy.findByTestId("color-selector-button").should("be.visible");
          cy.findByLabelText("ellipsis icon").should("be.visible");
          cy.findByLabelText("grabber icon").should("be.visible");
          cy.get("input").should("have.value", longColumnName2);
          cy.findByLabelText("close icon").should("be.visible");

          cy.findByTestId(`remove-${longColumnName2}`).click();
        });

      H.sidebar()
        .findAllByTestId("chartsettings-field-picker")
        .eq(2)
        .within(() => {
          cy.findByTestId("color-selector-button").should("be.visible");
          cy.findByLabelText("chevrondown icon").should("be.visible");
          cy.findByLabelText("ellipsis icon").should("be.visible");
          cy.findByLabelText("grabber icon").should("be.visible");
          cy.get("input").should("have.value", longColumnName1);
          cy.findByLabelText("close icon").should("be.visible");

          cy.findByTestId(`remove-${longColumnName1}`).click();
        });

      H.sidebar()
        .findAllByTestId("chartsettings-field-picker")
        .eq(1)
        .within(() => {
          cy.findByTestId("color-selector-button").should("be.visible");
          cy.findByLabelText("chevrondown icon").should("be.visible");
          cy.findByLabelText("ellipsis icon").should("be.visible");
          cy.get("input").should("have.value", regularColumnName);
        });
    });
  });
});

function getVisibleSidebarColumns() {
  return cy.findByTestId("visible-columns").findAllByRole("listitem");
}

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > table-editing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.activateToken("bleeding-edge");
    setTableEditingEnabledForDB(SAMPLE_DB_ID);

    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/table/*").as("getTable");
  });

  it("should allow to open table data page", () => {
    openDatabaseTable("People");

    cy.wait("@getTable");

    cy.findByTestId("main-navbar-root").should("not.be.visible");

    cy.findByTestId("table-data-view-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("People").should("be.visible");

        cy.findByText("Explore").should("be.visible");
        cy.findByText("Edit").should("be.visible");

        cy.findByTestId("table-root").should("be.visible");
      });
  });

  it("should allow to open table data edit mode", () => {
    openDatabaseTable("People");

    cy.wait("@getTable");

    cy.findByTestId("table-data-view-root").findByText("Edit").click();

    cy.findByTestId("edit-table-data-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("People").should("be.visible");
        cy.findByTestId("head-crumbs-container")
          .findByText("Edit")
          .should("be.visible");

        cy.findByTestId("table-root").should("be.visible");
      });

    cy.findByTestId("head-crumbs-container").findByText("People").click();

    cy.findByTestId("table-data-view-root").should("be.visible");
  });

  it("should allow to open table data explore mode - query builder", () => {
    openDatabaseTable("People");

    cy.wait("@getTable");

    cy.findByTestId("table-data-view-root").findByText("Explore").click();

    cy.findByTestId("query-builder-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("Sample Database");
        cy.findByText("People");
      });
  });

  describe("db setting is disabled", () => {
    it("should not allow to open table data view by default", () => {
      setTableEditingEnabledForDB(SAMPLE_DB_ID, false);

      openDatabaseTable("People");

      cy.findByTestId("query-builder-root")
        .should("be.visible")
        .within(() => {
          cy.findByText("Sample Database");
          cy.findByText("People");
        });
    });
  });

  describe("table edit mode", () => {
    beforeEach(() => {
      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getOrdersTable",
      );

      cy.intercept("POST", "api/dataset").as("getTableDataQuery");
      cy.intercept("POST", "api/action/v2/execute-bulk").as("updateTableData");

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

      cy.wait("@getOrdersTable");
    });

    it("should allow to filter table data", () => {
      cy.findByTestId("edit-table-data-root").findByText("Filter").click();

      H.popover().within(() => {
        cy.findByText("Discount").click();
        cy.findByText("Between").click();
      });

      H.menu().findByText("Not empty").click();
      H.popover().findByText("Apply filter").click();

      cy.wait("@getTableDataQuery");

      cy.findByTestId("filters-visibility-control").should("have.text", "1");

      // check that filter persists after page refresh
      cy.reload();
      cy.wait("@getTableDataQuery");

      cy.findByTestId("filters-visibility-control").should("have.text", "1");

      cy.findByTestId("qb-filters-panel")
        .should("be.visible")
        .within(() => {
          cy.icon("close").click();
        });

      cy.wait("@getTableDataQuery");
      cy.findByTestId("filters-visibility-control").should("not.exist");
    });

    it("should allow to sort table data", () => {
      cy.findByTestId("table-header").within(() => {
        cy.findByText("Quantity").click();

        cy.findAllByTestId("header-sort-indicator").should("have.length", 1);

        cy.findByText("Quantity")
          .closest("[role=button]")
          .findByLabelText("chevronup icon")
          .should("be.visible");

        cy.findByText("Quantity").click();

        cy.findByText("Quantity")
          .closest("[role=button]")
          .findByLabelText("chevrondown icon")
          .should("be.visible");
      });

      // check that sorting persist after page refresh
      cy.reload();
      cy.wait("@getTableDataQuery");

      cy.findByTestId("table-header").within(() => {
        cy.findByText("Quantity")
          .closest("[role=button]")
          .findByLabelText("chevrondown icon")
          .should("be.visible");

        cy.findByText("Quantity").click();

        cy.findAllByTestId("header-sort-indicator").should("have.length", 0);
      });
    });

    it("should allow to view row details", () => {
      openEditRowModal(2);
      H.modal().within(() => {
        cy.get("@rowId").then((rowId) => {
          cy.findAllByRole("textbox").first().should("have.value", rowId);
        });
      });
    });

    it("should allow to edit a row using a modal", () => {
      openEditRowModal(2);

      H.modal().within(() => {
        cy.findByTestId("Quantity-field-input")
          .type("{backspace}{backspace}{backspace}123")
          .blur();
      });

      cy.wait("@updateTableData").then(({ response: { body } }) => {
        expect(body.outputs[0].op).to.equal("updated");
        expect(body.outputs[0].row.QUANTITY).to.equal(123);
      });

      H.undoToast().findByText("Successfully updated").should("be.visible");
    });

    describe("inline cell editing", () => {
      const cases = [
        {
          table: "Orders",
          dataType: "number",
          column: "TAX",
          value: 123,
        },
        {
          table: "Orders",
          dataType: "date",
          column: "CREATED_AT",
          value: "8 May 2024",
        },
        {
          table: "Orders",
          dataType: "FK",
          column: "PRODUCT_ID",
          value: 5,
        },
        {
          table: "Products",
          dataType: "string",
          column: "TITLE",
          value: "Some new product",
        },
      ];

      cases.forEach(({ dataType, column, value, table }) => {
        it(`should allow to edit a cell with type ${dataType}`, () => {
          if (table === "Products") {
            cy.visit(
              `/browse/databases/${SAMPLE_DB_ID}/tables/${PRODUCTS_ID}/edit`,
            );
          }

          // Locate the table and the specific cell to edit
          cy.findByTestId("table-root")
            .findAllByRole("row")
            .eq(1) // Select the second row (index 1)
            .within(() => {
              cy.get(`[data-column-id='${column}']`).as("targetCell").click({
                scrollBehavior: false,
              }); // Activate inline editing
            });

          if (dataType === "number" || dataType === "string") {
            // Edit the cell value
            cy.get("@targetCell")
              .find("input") // Assuming the cell becomes an input field
              .type(`{selectAll}{backspace}${value}`, {
                scrollBehavior: false,
              }) // Enter the new value
              .blur(); // Trigger the save action by blurring the input
          } else if (dataType === "date") {
            H.popover().findByLabelText(value).click();

            cy.get("@targetCell").find("input").first().blur();
          } else if (dataType === "FK" || dataType === "category") {
            H.popover().findByText(value).click();
          }

          if (dataType !== "date") {
            // dates are harder to check due to formatting, so we don't check api specifically
            cy.wait("@updateTableData").then(({ response: { body } }) => {
              expect(body.outputs[0].op).to.equal("updated");
              expect(body.outputs[0].row[column]).to.equal(value);
            });
          }

          H.undoToast().findByText("Successfully updated").should("be.visible");
        });
      });

      it("should not allow to edit PK cells", () => {
        cy.findByTestId("table-root")
          .findAllByRole("row")
          .eq(1)
          .within(() => {
            cy.get("[data-column-id='ID']")
              .as("targetCell")
              .click({
                scrollBehavior: false,
              })
              .find("input")
              .should("not.exist");
          });
      });

      it("should handle errors", () => {
        cy.findByTestId("table-root")
          .findAllByRole("row")
          .eq(1)
          .within(() => {
            cy.get("[data-column-id='TAX']")
              .as("targetCell")
              .click({
                scrollBehavior: false,
              })
              .find("input")
              .type("{selectAll}{backspace}aaa", {
                scrollBehavior: false,
              }) // Enter the new value
              .blur(); // Trigger the save action by blurring the input
          });

        H.undoToast()
          .findByText("Couldn't save table changes")
          .should("be.visible");
      });
    });
  });
});

function setTableEditingEnabledForDB(dbId: number, enabled = true) {
  return cy.request("PUT", `/api/database/${dbId}`, {
    settings: {
      "database-enable-table-editing": enabled,
    },
  });
}

function openDatabaseTable(tableName: string) {
  cy.visit("/browse/databases");

  cy.wait("@getDatabases");

  cy.findByTestId("database-browser").findByText("Sample Database").click();
  cy.findByTestId("browse-schemas").findByText(tableName).click();
}

function openEditRowModal(rowIndex: number) {
  cy.findByTestId("table-root")
    .findAllByRole("row")
    .should("have.length.gte", 10)
    .eq(rowIndex)
    .within(() => {
      cy.findAllByTestId("cell-data")
        .first()
        .invoke("text")
        .then((text) => {
          cy.wrap(text).as("rowId");
        });

      cy.findAllByTestId("cell-data").first().realHover({
        scrollBehavior: false,
      });

      cy.findByTestId("detail-shortcut").click({
        scrollBehavior: false,
      });
    });

  H.modal().findByText("Edit record").should("be.visible");
}

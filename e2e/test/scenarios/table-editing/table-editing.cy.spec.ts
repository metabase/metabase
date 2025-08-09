import dayjs from "dayjs";

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

  it("should show edit icon on table browser", () => {
    openTableBrowser();
    getTableEditIcon("People").should("be.visible");
  });

  it("should not show edit icon on table browser if user is not admin", () => {
    cy.signInAsNormalUser();

    openTableBrowser();
    getTableEditIcon("People").should("not.exist");
  });

  it("should allow to open table data edit mode", () => {
    openTableBrowser();
    openTableEdit("People");

    cy.wait("@getTable");

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

    cy.findByTestId("query-builder-root").should("be.visible");
  });

  describe("db setting is disabled", () => {
    it("should not allow to open table data view by default", () => {
      setTableEditingEnabledForDB(SAMPLE_DB_ID, false);
      openTableBrowser();
      getTableEditIcon("People").should("not.exist");
    });
  });

  describe("non-admin user", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should not allow to open table data view", () => {
      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);
      cy.findByTestId("edit-table-data-restricted").should("be.visible");
    });
  });

  describe("table edit mode", () => {
    beforeEach(() => {
      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getOrdersTable",
      );

      cy.intercept("POST", "api/dataset").as("getTableDataQuery");
      cy.intercept("POST", "api/ee/action-v2/execute-bulk").as(
        "updateTableData",
      );

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
      cy.findByTestId("filters-visibility-control").click();

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

        cy.findByTestId("update-row-save-button").click();
      });

      cy.wait("@updateTableData").then(({ response }) => {
        expect(response?.body.outputs[0].op).to.equal("updated");
        expect(response?.body.outputs[0].row.QUANTITY).to.equal(123);
      });

      H.modal().should("not.exist");

      H.undoToast().findByText("Successfully updated").should("be.visible");
    });

    describe("inline cell editing", () => {
      // we use randomized values here to allow multiple runs in one session (since non-changed values are not updated)
      const cases = [
        {
          table: "Products",
          dataType: "string",
          column: "EAN",
          value: Math.floor(Math.random() * 100000)
            .toString()
            .padStart(13, "0"),
        },
        {
          table: "Orders",
          dataType: "number",
          column: "TAX",
          value: Math.floor(Math.random() * 1000),
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

          // Edit the cell value
          cy.get("@targetCell")
            .find("input") // Assuming the cell becomes an input field
            .type(`{selectAll}{backspace}${value}`, {
              scrollBehavior: false,
            }) // Enter the new value
            .blur(); // Trigger the save action by blurring the input

          cy.wait("@updateTableData").then(({ response }) => {
            expect(response?.body.outputs[0].op).to.equal("updated");
            expect(response?.body.outputs[0].row[column]).to.equal(value);
          });

          H.undoToast().findByText("Successfully updated").should("be.visible");
        });
      });

      it("should allow to edit a cell with datetime type", () => {
        cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

        // Locate the table and the specific cell to edit
        cy.findByTestId("table-root")
          .findAllByRole("row")
          .eq(1) // Select the second row (index 1)
          .within(() => {
            cy.get("[data-column-id='CREATED_AT']").as("targetCell").click({
              scrollBehavior: false,
            }); // Activate inline editing
          });

        const day = Math.floor(Math.random() * 10) + 10; // 10-20
        const hour = Math.floor(Math.random() * 12);
        const minute = Math.floor(Math.random() * 60);

        H.popover().within(() => {
          cy.findByRole("button", { name: `${day} May 2024` }).click();
          cy.findAllByRole("spinbutton").eq(0).type(hour.toString());
          cy.findAllByRole("spinbutton").eq(1).type(minute.toString());
          // It's safe to click the last button because we're in the popover
          // eslint-disable-next-line no-unsafe-element-filtering
          cy.findAllByRole("button").last().click();
        });

        cy.wait("@updateTableData").then(({ response }) => {
          const targetDate = dayjs(
            new Date(2024, 4, day, hour, minute, 0),
          ).format("YYYY-MM-DDTHH:mm:ss");
          const savedDate = response?.body.outputs[0].row.CREATED_AT;

          expect(response?.body.outputs[0].op).to.equal("updated");
          // Omit timezone offset
          expect(savedDate.startsWith(targetDate)).to.be.true;
        });

        H.undoToast().findByText("Successfully updated").should("be.visible");
      });

      it("should allow to edit a cell with select type", () => {
        cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

        cy.findByTestId("table-root")
          .findAllByRole("row")
          .eq(1)
          .within(() => {
            cy.get("[data-column-id='USER_ID']").as("targetCell").click({
              scrollBehavior: false,
            });
          });

        H.popover().within(() => {
          const randomIndex = Math.floor(2 + Math.random() * 18);

          cy.findAllByRole("option")
            .should("have.length", 20)
            .eq(randomIndex)
            .click();

          cy.wait("@updateTableData").then(({ response }) => {
            expect(response?.body.outputs[0].op).to.equal("updated");
          });
        });

        H.undoToast().findByText("Successfully updated").should("be.visible");
      });

      it("should not allow to edit PK cells", () => {
        cy.visit(
          `/browse/databases/${SAMPLE_DB_ID}/tables/${PRODUCTS_ID}/edit`,
        );

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

  describe("create / delete row", () => {
    beforeEach(() => {
      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getOrdersTable",
      );

      cy.intercept("POST", "api/dataset").as("getTableDataQuery");
      cy.intercept("POST", "api/ee/action-v2/execute-bulk").as("executeBulk");

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

      cy.wait("@getOrdersTable");
    });

    it("should allow to create and delete a row", () => {
      cy.findByTestId("new-record-button").click();

      H.modal().within(() => {
        cy.findByText("Create a new record").should("be.visible");
        cy.findByTestId("Tax-field-input").type("50");
        cy.findByTestId("Total-field-input").type("100");
        cy.findByTestId("Discount-field-input").type("10");
        cy.findByTestId("create-row-form-submit-button").click();
      });

      cy.wait("@executeBulk").then(({ response, request }) => {
        expect(request.body.action).to.equal("data-grid.row/create");
        expect(response?.body.outputs[0].op).to.equal("created");
        expect(response?.body.outputs[0].row.TAX).to.equal(50);
        expect(response?.body.outputs[0].row.TOTAL).to.equal(100);
        expect(response?.body.outputs[0].row.DISCOUNT).to.equal(10);
      });

      H.undoToast().within(() => {
        cy.findByText("Record successfully created").should("be.visible");
        cy.findByLabelText("close icon").click();
      });

      // We want to check if the new row is added as the last row to the table
      // eslint-disable-next-line no-unsafe-element-filtering
      cy.findByTestId("table-scroll-container")
        .scrollTo("bottom")
        .findAllByRole("row")
        .last()
        .should("have.attr", "data-dataset-index", "2000")
        .within(() => {
          cy.get('[data-column-id="TAX"]').should("have.text", "50");
          cy.get('[data-column-id="TOTAL"]').should("have.text", "100");
          cy.get('[data-column-id="DISCOUNT"]').should("have.text", "10");

          cy.findByTestId("detail-shortcut").click({
            scrollBehavior: false,
            force: true,
          });
        });

      H.modal()
        .first()
        .within(() => {
          cy.findByText("Edit record").should("be.visible");
          cy.findByTestId("delete-row-icon").click();
        });

      H.modal()
        .first()
        .within(() => {
          cy.findByText("Delete this record?").should("be.visible");
          cy.findByText("Delete record").click();
        });

      cy.wait("@executeBulk").then(({ response, request }) => {
        expect(request.body.action).to.equal("data-grid.row/delete");
        expect(response?.body.outputs[0].op).to.equal("deleted");
      });

      H.undoToast().findByText("Successfully deleted").should("be.visible");
    });

    it("should allow to delete multiple rows (bulk)", () => {
      cy.findByTestId("delete-records-bulk-button").should("be.disabled");

      cy.findAllByTestId("row-select-checkbox").eq(15).click();
      cy.findAllByTestId("row-select-checkbox").eq(16).click();

      cy.findByTestId("delete-records-bulk-button")
        .should("not.be.disabled")
        .click();

      H.modal().within(() => {
        cy.findByText("Delete 2 records?").should("be.visible");
        cy.findByRole("button", { name: "Delete 2 records" }).click();
      });

      cy.wait("@executeBulk").then(({ response, request }) => {
        expect(request.body.action).to.equal("data-grid.row/delete");
        expect(response?.body.outputs[0].op).to.equal("deleted");
      });

      H.undoToast().findByText("Successfully deleted").should("be.visible");

      cy.findByTestId("delete-records-bulk-button").should("be.disabled");
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

function openTableBrowser(databaseName: string = "Sample Database") {
  cy.visit("/browse/databases");
  cy.wait("@getDatabases");
  cy.findByTestId("database-browser").findByText(databaseName).click();
}

function getTableEditIcon(tableName: string) {
  return cy
    .findByTestId("browse-schemas")
    .contains(tableName)
    .realHover()
    .findByTestId("edit-table-icon");
}

function openTableEdit(tableName: string) {
  getTableEditIcon(tableName).click();
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

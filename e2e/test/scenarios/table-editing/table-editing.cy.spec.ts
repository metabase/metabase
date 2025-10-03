import dayjs from "dayjs";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { resetSnowplow } from "e2e/support/helpers/e2e-snowplow-helpers";

const { H } = cy;

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > table-editing", () => {
  beforeEach(() => {
    resetSnowplow();

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

    H.expectUnstructuredSnowplowEvent({
      event: "edit_data_button_clicked",
      triggered_from: "table-browser",
      target_id: PEOPLE_ID,
    });

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
      resetSnowplow();

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
          cy.findByTestId("ID-field-input").should("have.text", rowId);
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
      H.expectUnstructuredSnowplowEvent({
        event: "edit_data_record_modified",
        event_detail: "update",
        target_id: ORDERS_ID,
        triggered_from: "modal",
        result: "success",
      });
    });

    describe("inline cell editing", () => {
      // we use randomized values here to allow multiple runs in one session (since non-changed values are not updated)
      const cases = [
        {
          tableId: PRODUCTS_ID,
          dataType: "string",
          column: "EAN",
          value: Math.floor(Math.random() * 100000)
            .toString()
            .padStart(13, "0"),
        },
        {
          tableId: ORDERS_ID,
          dataType: "number",
          column: "TAX",
          value: Math.floor(Math.random() * 1000),
        },
        // TODO: fix flaky test due to timezone issues (runs locally but fails on CI)
        // {
        //   tableId: PEOPLE_ID,
        //   dataType: "date",
        //   column: "BIRTH_DATE",
        //   value: dayjs(
        //     new Date(
        //       Date.now() -
        //         Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 365),
        //     ),
        //   ).format("YYYY-MM-DD"),
        // },
      ];

      cases.forEach(({ dataType, column, value, tableId }) => {
        it(`should allow to edit a cell with type ${dataType}`, () => {
          cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${tableId}/edit`);

          // Locate the table and the specific cell to edit
          cy.findByTestId("table-root")
            .findAllByRole("row")
            .eq(1) // Select the second row (index 1)
            .within(() => {
              cy.get(`[data-column-id='${column}']`)
                .as("targetCell")
                .click({ scrollBehavior: "center" }); // Activate inline editing
            });

          // Edit the cell value
          cy.get("@targetCell")
            .find("input")
            .first() // Assuming the cell becomes an input field
            .type(`{selectAll}{backspace}${value}`) // Enter the new value
            .blur(); // Trigger the save action by blurring the input

          cy.wait("@updateTableData").then(({ response }) => {
            expect(response?.body.outputs[0].op).to.equal("updated");
            if (dataType === "date") {
              // BE returns the date in the report timezone, so we should ignore the timezone offset
              expect(response?.body.outputs[0].row[column]).to.satisfy(
                (date: string) => date.startsWith(value.toString()),
              );
            } else {
              expect(response?.body.outputs[0].row[column]).to.equal(value);
            }
          });

          H.expectUnstructuredSnowplowEvent({
            event: "edit_data_record_modified",
            event_detail: "update",
            target_id: tableId,
            triggered_from: "inline",
            result: "success",
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

        cy.wait("@updateTableData").then(({ response, request }) => {
          const targetDate = dayjs(
            new Date(2024, 4, day, hour, minute, 0),
          ).format("YYYY-MM-DDTHH:mm:ss");

          const requestDate = request.body.params.CREATED_AT;
          const responseDate = response?.body.outputs[0].row.CREATED_AT;

          // Check if request date matches the response date.
          // In theory FE should preserve the initial input date timezone offset (might be based on the CI environment)
          expect(requestDate).to.equal(responseDate);

          // Check if date param matches the input date (without timezone offset at offset 19)
          expect(requestDate.slice(0, 19)).to.equal(targetDate);
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
        cy.visit(
          `/browse/databases/${SAMPLE_DB_ID}/tables/${PRODUCTS_ID}/edit`,
        );

        cy.findByTestId("table-root")
          .findAllByRole("row")
          .eq(1)
          .within(() => {
            cy.get("[data-column-id='EAN']")
              .as("targetCell")
              .click({
                scrollBehavior: false,
              })
              .find("input")
              // Should be more than 13 characters to trigger the error
              .type("{selectAll}{backspace}aaaaaaaaaaaaaaaaaaaaaaaaa", {
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
      resetSnowplow();

      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getOrdersTable",
      );

      cy.intercept("POST", "api/dataset").as("getTableDataQuery");
      cy.intercept("POST", "api/ee/action-v2/execute-bulk").as("executeBulk");

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

      cy.wait("@getOrdersTable");
    });

    it("should allow to create a row", () => {
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

      H.expectUnstructuredSnowplowEvent({
        event: "edit_data_record_modified",
        event_detail: "create",
        target_id: ORDERS_ID,
        triggered_from: "modal",
        result: "success",
      });
    });

    it("should allow to delete multiple rows (bulk)", () => {
      cy.findAllByTestId("row-select-checkbox").eq(15).click();
      cy.findAllByTestId("row-select-checkbox").eq(16).click();

      cy.log("should not show edit icon when rows are selected");
      cy.findByTestId("row-edit-icon").should("not.exist");

      cy.log("should bulk delete rows");
      cy.findByTestId("toast-card").findByText("Delete").click();

      H.modal().within(() => {
        cy.findByText("Delete 2 records?").should("be.visible");
        cy.findByRole("button", { name: "Delete 2 records" }).click();
      });

      cy.wait("@executeBulk").then(({ response, request }) => {
        expect(request.body.action).to.equal("data-grid.row/delete");
        expect(response?.body.outputs[0].op).to.equal("deleted");
      });

      cy.findByTestId("toast-card").should("not.exist");

      H.undoToast().findByText("Successfully deleted").should("be.visible");

      cy.log("should show edit icon when no rows are selected");
      cy.findAllByTestId("row-edit-icon").should("exist");
    });
  });

  describe("table editing bugs", () => {
    it("WRK-907: should not allow to create new values for FK fields", () => {
      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getOrdersTable",
      );

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

      cy.wait("@getOrdersTable");

      cy.findByTestId("new-record-button").click();

      const NON_EXISTING_ID = "999999";
      cy.intercept(
        "GET",
        `/api/field/${ORDERS.USER_ID}/search/${ORDERS.USER_ID}?value=${NON_EXISTING_ID}&limit=20`,
      ).as("getFieldValues");

      H.modal().within(() => {
        cy.findByTestId("User ID-field-input").click();
        cy.realType(NON_EXISTING_ID);
      });

      cy.wait("@getFieldValues");

      H.popover().within(() => {
        cy.findByText("Nothing found").should("be.visible");
        cy.findByText(`Add option: ${NON_EXISTING_ID}`).should("not.exist");
      });

      cy.intercept("GET", `/api/table/${PRODUCTS_ID}/query_metadata`).as(
        "getProductsTable",
      );

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${PRODUCTS_ID}/edit`);

      cy.wait("@getProductsTable");

      cy.findByTestId("new-record-button").click();

      cy.intercept(
        "GET",
        `/api/field/${PRODUCTS.CATEGORY}/search/${PRODUCTS.CATEGORY}?value=${NON_EXISTING_ID}&limit=20`,
      ).as("getCategoryValues");

      H.modal().within(() => {
        cy.findByTestId("Category-field-input").click();
        cy.realType(NON_EXISTING_ID);
      });

      H.popover().within(() => {
        cy.findByRole("option", {
          name: `Add option: ${NON_EXISTING_ID}`,
        }).should("be.visible");
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

      cy.findByTestId("row-edit-icon").click({
        scrollBehavior: false,
      });
    });

  H.modal().findByText("Edit record").should("be.visible");
}

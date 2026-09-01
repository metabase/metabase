/**
 * Warning!
 * Do not modify SAMPLE_DB data to test any table editing features.
 * It is used in multiple tests and any changes will break them.
 */

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { resetSnowplow } from "e2e/support/helpers/e2e-snowplow-helpers";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import { dayjs } from "metabase/dayjs";

const { H } = cy;
const { ALL_USERS_GROUP } = USER_GROUPS;
const { ORDERS_ID, PRODUCTS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const EDITABLE_SOURCE_TABLE_NAME = "many_data_types";
const EDITABLE_SOURCE_TABLE_NAME_REGEX = new RegExp("Many Data Types", "i");
const INLINE_EDIT_TEST_TABLE_NAME = "editing_test";
const DEFAULT_FIELD = "UUID";

// `many_data_types` seeds two rows; the editing tests target the second one,
// whose date columns fall in February 2020 (the month the date pickers open on).
const TEST_TABLE_ROW_COUNT = 2;
const TARGET_ROW_ID = 2;

describe("scenarios > table-editing", () => {
  beforeEach(() => {
    resetSnowplow();

    H.restore("postgres-writable");
    H.resetTestTable({
      type: "postgres",
      table: EDITABLE_SOURCE_TABLE_NAME,
    });

    cy.signInAsAdmin();
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": DataPermissionValue.UNRESTRICTED,
          "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        },
      },
    });

    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: EDITABLE_SOURCE_TABLE_NAME,
    });

    H.activateToken("pro-self-hosted");

    setTableEditingEnabledForDB(WRITABLE_DB_ID);

    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/table/*").as("getTable");
  });

  it("should show edit icon on table browser", () => {
    openTableBrowser();
    getTableEditIcon(EDITABLE_SOURCE_TABLE_NAME_REGEX).should("be.visible");
  });

  it("should not show edit icon on table browser if user is not admin", () => {
    cy.signInAsNormalUser();

    openTableBrowser();
    getTableEditIcon(EDITABLE_SOURCE_TABLE_NAME_REGEX).should("not.exist");
  });

  it("should allow to open table data edit mode", () => {
    openTableBrowser();
    openTableEdit(EDITABLE_SOURCE_TABLE_NAME_REGEX);

    H.getTableId({
      name: EDITABLE_SOURCE_TABLE_NAME,
    }).then((tableId) => {
      H.expectUnstructuredSnowplowEvent({
        event: "edit_data_button_clicked",
        triggered_from: "table-browser",
        target_id: tableId,
      });
    });

    cy.wait("@getTable");

    cy.findByTestId("edit-table-data-root")
      .should("be.visible")
      .within(() => {
        cy.findByText(EDITABLE_SOURCE_TABLE_NAME_REGEX).should("be.visible");
        cy.findByTestId("head-crumbs-container")
          .findByText("Edit")
          .should("be.visible");

        cy.findByTestId("table-root").should("be.visible");
      });

    cy.findByTestId("head-crumbs-container")
      .findByText(EDITABLE_SOURCE_TABLE_NAME_REGEX)
      .click();

    cy.findByTestId("query-builder-root").should("be.visible");
  });

  describe("db setting is disabled", () => {
    it("should not allow to open table data view by default", () => {
      setTableEditingEnabledForDB(WRITABLE_DB_ID, false);
      openTableBrowser();
      getTableEditIcon(EDITABLE_SOURCE_TABLE_NAME_REGEX).should("not.exist");
    });
  });

  describe("non-admin user", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should not allow to open table data view", () => {
      H.getTableId({
        databaseId: WRITABLE_DB_ID,
        name: EDITABLE_SOURCE_TABLE_NAME,
      }).then((tableId) => {
        cy.visit(`/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`);
        cy.findByTestId("edit-table-data-restricted").should("be.visible");
      });
    });
  });

  describe("table edit mode", () => {
    beforeEach(() => {
      resetSnowplow();

      H.queryWritableDB(
        `DROP TABLE IF EXISTS ${INLINE_EDIT_TEST_TABLE_NAME}`,
        "postgres",
      );
      H.queryWritableDB(
        `CREATE TABLE ${INLINE_EDIT_TEST_TABLE_NAME} AS SELECT id, uuid, integer, tinyint, string, date, datetime, boolean FROM ${EDITABLE_SOURCE_TABLE_NAME}`,
        "postgres",
      );

      /*
        Without `tableName` the helper returns as soon as the database reports
        any table at all, so it can hand back before the freshly created table
        has been scanned. Row updates key on the PK that classification infers
        for the "id" column, and the "string" field id below has to exist, so
        wait for this table specifically. `retrigger` covers sync_schema calls
        that get silently dropped by the single-threaded task pool.
      */
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: INLINE_EDIT_TEST_TABLE_NAME,
        retrigger: true,
      });

      H.getTableId({
        databaseId: WRITABLE_DB_ID,
        name: INLINE_EDIT_TEST_TABLE_NAME,
      }).then((tableId) => {
        /*
          Adjusting "string" column type.
          By default it is set to "type/Category" due to only 2 unique values in test dataset.
          This causes to "string" column cell rendering a dropdown instead of an input field
          when editing.
        */
        H.getFieldId({
          tableId,
          name: "string",
        }).then((fieldId) => {
          cy.request("PUT", `/api/field/${fieldId}`, {
            semantic_type: null,
          });
        });

        cy.intercept("GET", `/api/table/${tableId}/query_metadata`).as(
          "getDataTable",
        );
        cy.intercept("POST", "api/dataset").as("getTableDataQuery");
        cy.intercept("POST", "api/ee/action-v2/execute-bulk").as(
          "updateTableData",
        );

        cy.visit(`/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`);
      });

      cy.log("wait for the grid to be interactive");
      cy.wait("@getDataTable");
      cy.wait("@getTableDataQuery");
      H.tableInteractiveBody()
        .find("[data-column-id='id']")
        .should("have.length", TEST_TABLE_ROW_COUNT);
      cy.findByTestId("edit-table-data-loading-overlay").should("not.exist");
    });

    afterEach(() => {
      H.queryWritableDB(
        `DROP TABLE IF EXISTS ${INLINE_EDIT_TEST_TABLE_NAME}`,
        "postgres",
      );
    });

    it("should allow to filter table data", () => {
      cy.findByTestId("edit-table-data-root").findByText("Filter").click();

      H.popover().within(() => {
        cy.findByText("ID").click();
        cy.findByText("Is").click();
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
        cy.findByText(DEFAULT_FIELD).click();

        cy.findAllByTestId("header-sort-indicator").should("have.length", 1);

        cy.findByText(DEFAULT_FIELD)
          .closest("[role=button]")
          .findByLabelText("chevronup icon")
          .should("be.visible");

        cy.findByText(DEFAULT_FIELD).click();

        cy.findByText(DEFAULT_FIELD)
          .closest("[role=button]")
          .findByLabelText("chevrondown icon")
          .should("be.visible");
      });

      // check that sorting persist after page refresh
      cy.reload();
      cy.wait("@getTableDataQuery");

      cy.findByTestId("table-header").within(() => {
        cy.findByText(DEFAULT_FIELD)
          .closest("[role=button]")
          .findByLabelText("chevrondown icon")
          .should("be.visible");

        cy.findByText(DEFAULT_FIELD).click();

        cy.findAllByTestId("header-sort-indicator").should("have.length", 0);
      });
    });

    it("should allow to view row details", () => {
      openEditRowModal(1);
      H.modal().within(() => {
        cy.get("@rowId").then((rowId) => {
          cy.findByTestId("ID-field-input").should("have.text", rowId);
        });
      });
    });

    it("should allow to edit a row using a modal", () => {
      openEditRowModal(1);

      H.modal().within(() => {
        cy.findByTestId("Integer-field-input")
          .type("{selectAll}{backspace}123")
          .blur();

        cy.findByTestId("update-row-save-button").click();
      });

      cy.wait("@updateTableData").then(({ response }) => {
        expect(response?.body.outputs[0].op).to.equal("updated");
        expect(response?.body.outputs[0].row.integer).to.equal(123);
      });

      H.modal().should("not.exist");

      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getTableId({
        databaseId: WRITABLE_DB_ID,
        name: INLINE_EDIT_TEST_TABLE_NAME,
      }).then((tableId) => {
        H.expectUnstructuredSnowplowEvent({
          event: "edit_data_record_modified",
          event_detail: "update",
          target_id: tableId,
          triggered_from: "modal",
          result: "success",
        });
      });
    });

    describe("inline cell editing", () => {
      const cases = [
        {
          dataType: "integer",
          column: "integer",
          value: 1234,
        },
        {
          dataType: "tinyint",
          column: "tinyint",
          value: 42,
        },
        {
          dataType: "string",
          column: "string",
          value: "test",
        },
      ];

      cases.forEach(({ dataType, column, value }) => {
        it(`should allow to edit a cell with type ${dataType}`, () => {
          getEditableCell(TARGET_ROW_ID, column)
            .as("targetCell")
            .click({ scrollBehavior: false });

          cy.get("@targetCell")
            .find("input")
            .type(`{selectAll}{backspace}${value}`, { scrollBehavior: false })
            /*
              The number input holds its value in React state that the blur
              handler closes over, so blurring before the DOM has settled sends
              the pre-edit value (or the empty intermediate one).
            */
            .should("have.value", String(value))
            .blur();

          cy.wait("@updateTableData").then(({ response }) => {
            expect(response?.body.outputs[0].op).to.equal("updated");
            expect(response?.body.outputs[0].row[column]).to.equal(value);
          });

          cy.log("the toast auto-hides after 5s, so assert it before Snowplow");
          H.undoToast().findByText("Successfully updated").should("be.visible");

          H.getTableId({
            databaseId: WRITABLE_DB_ID,
            name: INLINE_EDIT_TEST_TABLE_NAME,
          }).then((tableId) => {
            H.expectUnstructuredSnowplowEvent({
              event: "edit_data_record_modified",
              event_detail: "update",
              target_id: tableId,
              triggered_from: "inline",
              result: "success",
            });
          });
        });
      });

      it("should allow to edit a cell with date type", () => {
        getEditableCell(TARGET_ROW_ID, "date").click({
          scrollBehavior: false,
        });

        // The picker opens on the month of the cell's current value.
        const day = 15;

        H.popover().within(() => {
          cy.findByRole("button", { name: `${day} February 2020` }).click();
        });

        cy.wait("@updateTableData").then(({ response }) => {
          const targetDate = dayjs(new Date(2020, 1, day)).format("YYYY-MM-DD");
          const responseDate = dayjs(response?.body.outputs[0].row.date).format(
            "YYYY-MM-DD",
          );

          expect(responseDate).to.equal(targetDate);
        });

        H.undoToast().findByText("Successfully updated").should("be.visible");
      });

      it("should allow to edit a cell with datetime type", () => {
        getEditableCell(TARGET_ROW_ID, "datetime").click({
          scrollBehavior: false,
        });

        const day = 15;
        const hour = 11;
        const minute = 35;

        H.popover().within(() => {
          cy.findByRole("button", { name: `${day} February 2020` }).click();
          cy.findAllByRole("spinbutton").eq(0).type(hour.toString());
          cy.findAllByRole("spinbutton").eq(1).type(minute.toString());
          cy.get('select[data-am-pm="true"]').as("ampmSelect");
          cy.get("@ampmSelect").select("AM");
          // It's safe to click the last button because we're in the popover
          // eslint-disable-next-line metabase/no-unsafe-element-filtering
          cy.findAllByRole("button").last().click();
        });

        cy.wait("@updateTableData").then(({ response, request }) => {
          const targetDate = "2020-02-15T11:35:00";

          const requestDate = request.body.params.datetime;
          const responseDate = response?.body.outputs[0].row.datetime;

          // Check if request date matches the response date.
          // In theory FE should preserve the initial input date timezone offset (might be based on the CI environment)
          expect(requestDate).to.equal(responseDate);

          // Check if date param matches the input date (without timezone offset at offset 19)
          expect(requestDate.slice(0, 19)).to.equal(targetDate);
        });

        H.undoToast().findByText("Successfully updated").should("be.visible");
      });

      it("should allow to edit a cell with select type", () => {
        // The target row's boolean is `false`, so "True" is always a change.
        getEditableCell(TARGET_ROW_ID, "boolean").click({
          scrollBehavior: false,
        });

        H.popover().within(() => {
          // 3: True, False, None
          cy.findAllByRole("option").should("have.length", 3);
          cy.findByRole("option", { name: "True" }).click();
        });

        cy.wait("@updateTableData").then(({ response }) => {
          expect(response?.body.outputs[0].op).to.equal("updated");
          expect(response?.body.outputs[0].row.boolean).to.equal(true);
        });

        H.undoToast().findByText("Successfully updated").should("be.visible");
      });

      it("should not allow to edit PK cells", () => {
        getEditableCell(TARGET_ROW_ID, "id")
          .click({ scrollBehavior: false })
          .should("be.visible")
          .find("input")
          .should("not.exist");
      });

      it("should handle errors", () => {
        getEditableCell(TARGET_ROW_ID, "tinyint")
          .click({ scrollBehavior: false })
          .find("input")
          // Entering a big number into tinyint column
          .type("{selectAll}{backspace}9999999", {
            scrollBehavior: false,
          })
          .should("have.value", "9999999")
          .blur(); // Trigger the save action by blurring the input

        H.undoToast()
          .findByText("Couldn't save table changes")
          .should("be.visible");
      });
    });
  });

  describe("create / delete row", () => {
    beforeEach(() => {
      resetSnowplow();

      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "scoreboard_actions" });
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: "scoreboard_actions",
      });

      H.activateToken("pro-self-hosted");
      setTableEditingEnabledForDB(WRITABLE_DB_ID);

      cy.intercept("GET", "/api/table/*/query_metadata").as("getTableMetadata");
      cy.intercept("POST", "api/dataset").as("getTableDataQuery");
      cy.intercept("POST", "api/ee/action-v2/execute-bulk").as("executeBulk");

      H.getTableId({ name: "scoreboard_actions" }).then((tableId) => {
        cy.visit(`/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`);
      });

      cy.wait("@getTableMetadata");
    });

    it("should allow to create a row", () => {
      cy.findByTestId("new-record-button").click();

      H.modal().findByText("Create a new record").should("be.visible");

      cy.findByTestId("Team Name-field-input").click();
      H.popover().findByRole("textbox").type("New York Bricks");
      H.popover()
        .findByText(/Add option/)
        .click();
      cy.findByTestId("Score-field-input").type("987");
      cy.findByTestId("Status-field-input").click();
      H.popover().findByText("active").click();

      cy.findByTestId("create-row-form-submit-button").click();

      cy.wait("@executeBulk").then(({ response, request }) => {
        expect(request.body.action).to.equal("data-grid.row/create");
        expect(response?.body.outputs[0].op).to.equal("created");
        expect(response?.body.outputs[0].row.score).to.equal(987);
        expect(response?.body.outputs[0].row.status).to.equal("active");
        expect(response?.body.outputs[0].row.team_name).to.equal(
          "New York Bricks",
        );
      });

      H.undoToast().within(() => {
        cy.findByText("Record successfully created").should("be.visible");
        cy.findByLabelText("close icon").click();
      });

      cy.findByTestId("table-root").within(() => {
        cy.findByText("New York Bricks").should("be.visible");
        cy.findByText("987").should("be.visible");
      });

      H.getTableId({ name: "scoreboard_actions" }).then((tableId) => {
        H.expectUnstructuredSnowplowEvent({
          event: "edit_data_record_modified",
          event_detail: "create",
          target_id: tableId,
          triggered_from: "modal",
          result: "success",
        });
      });
    });

    it("should allow to delete multiple rows (bulk)", () => {
      cy.findAllByTestId("row-select-checkbox").eq(1).click();
      cy.findAllByTestId("row-select-checkbox").eq(2).click();

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
      setTableEditingEnabledForDB(SAMPLE_DB_ID);
      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getDataTable",
      );
      const NON_EXISTING_ID = "999999";
      cy.intercept(
        "GET",
        `/api/field/${ORDERS.USER_ID}/search/${ORDERS.USER_ID}?value=${NON_EXISTING_ID}&limit=20`,
      ).as("getFieldValues");
      cy.intercept(
        "GET",
        `/api/field/${PRODUCTS.CATEGORY}/search/${PRODUCTS.CATEGORY}?value=${NON_EXISTING_ID}&limit=20`,
      ).as("getCategoryValues");

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

      cy.wait("@getDataTable");

      cy.findByTestId("new-record-button").click();

      H.modal().within(() => {
        cy.findByTestId("User ID-field-input").click();
        cy.realType(NON_EXISTING_ID);
      });

      cy.wait("@getFieldValues");

      H.popover().within(() => {
        cy.findByText("Nothing found").should("be.visible");
        cy.findByText(`Add option: ${NON_EXISTING_ID}`).should("not.exist");
      });

      H.modal().findByText("Cancel").click();

      cy.intercept("GET", `/api/table/${PRODUCTS_ID}/query_metadata`).as(
        "getProductsTable",
      );

      // navigate via breadcrumbs to avoid calling expensive `cy.visit`
      cy.findByTestId("head-crumbs-container")
        .findByText("Sample Database")
        .click();
      openTableEdit(new RegExp("Products", "i"));

      cy.wait("@getProductsTable");

      cy.findByTestId("new-record-button").click();

      H.modal().within(() => {
        cy.findByTestId("Category-field-input").click();
        cy.realType(NON_EXISTING_ID);
      });

      H.popover()
        .findByRole("option", { name: `Add option: ${NON_EXISTING_ID}` })
        .should("be.visible");
    });

    it("should allow creating a record in a table with a required date column (metabase#70647)", () => {
      const TABLE_NAME = "date_create_test";

      H.queryWritableDB(`DROP TABLE IF EXISTS ${TABLE_NAME}`, "postgres");
      H.queryWritableDB(
        `CREATE TABLE ${TABLE_NAME} (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          sale_date DATE NOT NULL
        )`,
        "postgres",
      );
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });

      cy.intercept("GET", "/api/table/*/query_metadata").as("getTableMetadata");
      cy.intercept("POST", "api/ee/action-v2/execute-bulk").as("executeBulk");

      H.getTableId({ databaseId: WRITABLE_DB_ID, name: TABLE_NAME }).then(
        (tableId) => {
          cy.visit(
            `/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`,
          );
        },
      );
      cy.wait("@getTableMetadata");

      cy.findByTestId("new-record-button").click();
      H.modal().findByText("Create a new record").should("be.visible");

      // The DATE column is NOT NULL, so the form stays invalid until a date is
      // picked. Before the fix, picking a date never reached the form state, so
      // the submit button stayed disabled and the row could not be created.
      cy.findByTestId("Sale Date-field-input").should("be.visible");
      cy.findByTestId("create-row-form-submit-button").should("be.disabled");

      const targetDay = dayjs().date(15);
      cy.findByTestId("Sale Date-field-input").click();
      H.popover()
        .findByRole("button", { name: targetDay.format("D MMMM YYYY") })
        .click();

      cy.findByTestId("create-row-form-submit-button")
        .should("be.enabled")
        .click();

      cy.wait("@executeBulk").then(({ request, response }) => {
        expect(request.body.action).to.equal("data-grid.row/create");
        expect(response?.body.outputs[0].op).to.equal("created");

        const responseDate = dayjs(
          response?.body.outputs[0].row.sale_date,
        ).format("YYYY-MM-DD");
        expect(responseDate).to.equal(targetDay.format("YYYY-MM-DD"));
      });

      H.undoToast()
        .findByText("Record successfully created")
        .should("be.visible");

      H.queryWritableDB(`DROP TABLE IF EXISTS ${TABLE_NAME}`, "postgres");
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

function openTableBrowser(databaseName: string = "Writable Postgres12") {
  cy.visit("/browse/databases");
  cy.wait("@getDatabases");
  cy.findByTestId("database-browser").findByText(databaseName).click();
}

function getTableEditIcon(tableName: RegExp) {
  return cy
    .findByTestId("browse-schemas")
    .contains(tableName)
    .realHover()
    .findByTestId("edit-table-icon");
}

function openTableEdit(tableName: RegExp) {
  getTableEditIcon(tableName).click();
}

/**
 * Rows are split across the pinned and center quadrants; only the center one
 * carries the "id" cell, so filtering on it yields a single row element.
 * Matching on the id value keeps targeting stable — the grid query has no
 * ORDER BY, so display position is not guaranteed.
 */
function getEditableRow(rowId: number) {
  return H.tableInteractiveBody()
    .findAllByRole("row")
    .filter(
      (_, row) =>
        row.querySelector("[data-column-id='id']")?.textContent?.trim() ===
        String(rowId),
    );
}

function getEditableCell(rowId: number, column: string) {
  return getEditableRow(rowId).find(`[data-column-id='${column}']`);
}

function openEditRowModal(rowIndex: number) {
  cy.findByTestId("table-root")
    .findAllByRole("row")
    .should("have.length.gte", 4)
    .filter((_, el) => rowIndex === Number(el.dataset.datasetIndex))
    .as("rowSections");

  cy.get("@rowSections")
    .eq(0)
    .within(() => {
      cy.get("[data-column-id]").first().realHover();
      cy.findByTestId("row-edit-icon").click();
    });

  cy.get("@rowSections")
    .eq(1)
    .within(() => {
      cy.findAllByTestId("cell-data")
        .eq(0)
        .invoke("text")
        .then((text) => {
          cy.wrap(text).as("rowId");
        });
    });

  H.modal().findByText("Edit record").should("be.visible");
}

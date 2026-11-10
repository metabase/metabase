/**
 * Warning!
 * Do not modify SAMPLE_DB data to test any table editing features.
 * It is used in multiple tests and any changes will break them.
 */

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { resetSnowplow } from "e2e/support/helpers/e2e-snowplow-helpers";

const { H } = cy;

describe("scenarios > actions > table editing", () => {
  beforeEach(() => {
    resetSnowplow();

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    setTableEditingEnabledForDB(WRITABLE_DB_ID);
  });

  it("should create, edit and delete rows", () => {
    H.resetTestTable({ type: "postgres", table: "scoreboard_actions" });
    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: "scoreboard_actions",
    });

    cy.intercept("GET", "/api/table/*/query_metadata").as("getTableMetadata");
    cy.intercept("POST", "api/ee/action-v2/execute-bulk").as("executeBulk");

    H.getTableId({ name: "scoreboard_actions" }).then((tableId) => {
      cy.visit(`/browse/databases/${WRITABLE_DB_ID}/tables/${tableId}/edit`);
    });

    cy.wait("@getTableMetadata");

    cy.log("create a row");
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

    cy.wait("@executeBulk");
    dismissUndoToast("Record successfully created");

    getRowByText("New York Bricks")
      .should("be.visible")
      .and("contain.text", "987")
      .and("contain.text", "active");

    H.getTableId({ name: "scoreboard_actions" }).then((tableId) => {
      H.expectUnstructuredSnowplowEvent({
        event: "edit_data_record_modified",
        event_detail: "create",
        target_id: tableId,
        triggered_from: "modal",
        result: "success",
      });
    });

    cy.log("edit the new row inline");
    getRowByText("New York Bricks")
      .find("[data-column-id='status']")
      .click({ scrollBehavior: false });
    H.popover().findByText("inactive").click();

    cy.wait("@executeBulk");
    dismissUndoToast("Successfully updated");

    cy.log("the created and edited row is stored");
    cy.reload();
    cy.wait("@getTableMetadata");
    getRowByText("New York Bricks")
      .should("contain.text", "987")
      .and("contain.text", "inactive");

    cy.log("bulk delete rows");
    selectRowByText("New York Bricks");
    selectRowByText("Bouncy Bears");

    cy.findByTestId("toast-card").findByText("Delete").click();

    H.modal().within(() => {
      cy.findByText("Delete 2 records?").should("be.visible");
      cy.findByRole("button", { name: "Delete 2 records" }).click();
    });

    cy.wait("@executeBulk");
    H.undoToast().findByText("Successfully deleted").should("be.visible");

    cy.log("the deleted rows are gone from the table");
    cy.reload();
    cy.wait("@getTableMetadata");
    cy.findByTestId("table-root").within(() => {
      cy.findByText("Amorous Aardvarks").should("be.visible");
      cy.findByText("New York Bricks").should("not.exist");
      cy.findByText("Bouncy Bears").should("not.exist");
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

/**
 * Rows are split across the pinned and center quadrants; the cell text sits in
 * the center one, so this yields that half of the row.
 */
function getRowByText(text: string) {
  return cy.findByTestId("table-root").findByText(text).closest("[role=row]");
}

/**
 * The row checkbox sits in the pinned quadrant and the cell text in the
 * center one; both halves of a row share its dataset index.
 */
function selectRowByText(text: string) {
  getRowByText(text)
    .invoke("attr", "data-dataset-index")
    .then((datasetIndex) => {
      cy.findByTestId("table-root")
        .find(`[role=row][data-dataset-index='${datasetIndex}']`)
        .findByTestId("row-select-checkbox")
        .click();
    });
}

/**
 * Success toasts stack, so each one is dismissed before the next edit can
 * raise another.
 */
function dismissUndoToast(message: string) {
  H.undoToast().within(() => {
    cy.findByText(message).should("be.visible");
    cy.findByLabelText("close icon").click();
  });
  H.undoToast().should("not.exist");
}

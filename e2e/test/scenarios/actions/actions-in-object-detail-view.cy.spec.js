import moment from "moment-timezone";

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  undoToast,
  visitModel,
} from "e2e/support/helpers";

const PG_DB_ID = 2;
const PG_ORDERS_TABLE_ID = 9;
const WRITABLE_TEST_TABLE = "scoreboard_actions";

const ORDERS_MODEL = {
  name: "Orders model",
  dataset: true,
  display: "table",
  database: PG_DB_ID,
  query: {
    "source-table": PG_ORDERS_TABLE_ID,
  },
};

const FIRST_ORDER_ID = 11;
const SECOND_ORDER_ID = 12;
const UPDATED_SCORE = 987654321;
const UPDATED_SCORE_FORMATTED = "987,654,321";

describe("Model actions in object detail view", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/action").as("createBasicActions");
    cy.intercept("GET", "/api/action/*/execute?parameters=*").as(
      "prefetchValues",
    );

    resetTestTable({ type: "postgres", table: WRITABLE_TEST_TABLE });
    restore("postgres-writable");
    cy.signInAsAdmin();
    resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: WRITABLE_TEST_TABLE });
    cy.createQuestion(ORDERS_MODEL, { wrapId: true, idAlias: "modelId" });
    cy.signOut();
  });

  it("scenario", () => {
    cy.get("@modelId").then(modelId => {
      asNormalUser(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabNotExists(modelId);

        visitObjectDetail(modelId, FIRST_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });
      });

      asAdmin(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabNotExists(modelId);

        visitObjectDetail(modelId, FIRST_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });

        enableDatabaseActions();

        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabExists(modelId);

        visitObjectDetail(modelId, FIRST_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });
      });

      asNormalUser(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabExists(modelId);

        visitObjectDetail(modelId, FIRST_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });
      });

      asAdmin(() => {
        createBasicModelActions(modelId);

        visitObjectDetail(modelId, FIRST_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownExists();
        });
      });

      asNormalUser(() => {
        visitObjectDetail(modelId, FIRST_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownExists();
        });

        openUpdateObjectModal();
        actionExecuteModal().within(() => {
          cy.wait("@prefetchValues").then(request => {
            const firstOrder = request.response.body;

            actionForm().within(() => {
              assertOrderFormPrefilled(firstOrder);
            });
          });

          cy.icon("close").click();
        });
        objectDetailModal().icon("close").click();

        visitObjectDetail(modelId, SECOND_ORDER_ID);
        objectDetailModal().within(() => {
          assertActionsDropdownExists();
        });

        openUpdateObjectModal();
        actionExecuteModal().within(() => {
          cy.wait("@prefetchValues").then(request => {
            const secondOrder = request.response.body;

            actionForm().within(() => {
              assertOrderFormPrefilled(secondOrder);

              cy.findByLabelText("Score").clear().type(UPDATED_SCORE);
              cy.findByText("Update").click();
            });
          });
        });
        objectDetailModal().icon("close").click();

        assertSuccessfullUpdateToast();
        assertScoreUpdatedInTable();
      });
    });
  });
});

function asAdmin(callback) {
  cy.signInAsAdmin();
  callback();
  cy.signOut();
}

function asNormalUser(callback) {
  cy.signInAsNormalUser();
  callback();
  cy.signOut();
}

function enableDatabaseActions() {
  cy.visit(`/admin/databases/${SAMPLE_DB_ID}`);
  const actionsToggle = cy.findByLabelText("Model actions");

  cy.log("actions should be disabled in model page");
  actionsToggle.should("not.be.checked");

  actionsToggle.click();

  cy.log("actions should be enabled in model detail page");
  actionsToggle.should("be.checked");
}

function createBasicModelActions(modelId) {
  cy.visit(`/model/${modelId}/detail/actions`);
  cy.findByText("Create basic actions").click();
  cy.wait("@createBasicActions");
}

function visitObjectDetail(modelId, objectId) {
  visitModel(modelId);
  cy.findAllByText(objectId).first().click();
}

function openUpdateObjectModal() {
  cy.findByTestId("actions-menu").click();
  popover().findByText("Update").click();
}

function assertActionsDropdownExists() {
  cy.log("actions dropdown should be shown in object details modal");
  cy.findByTestId("actions-menu").should("exist");
}

function assertActionsDropdownNotExists() {
  cy.log("actions dropdown should not be shown in object details modal");
  cy.findByTestId("actions-menu").should("not.exist");
}

function assertActionsTabExists(modelId) {
  cy.log("actions tab should be shown in model detail page");
  cy.findByText("Actions").should("exist");
}

function assertActionsTabNotExists(modelId) {
  cy.log("actions tab should not be shown in model detail page");
  cy.findByText("Actions").should("not.exist");
}

function assertOrderFormPrefilled(object) {
  assertInputValue("ID", object.id);
  assertInputValue("Team Name", object.team_name);
  assertInputValue("Score", object.score);
  assertInputValue("Status", object.status);
  assertDateInputValue("Created At", object.created_at);
  assertDateInputValue("Updated At", object.updated_at);
}

function assertInputValue(labelText, value) {
  const expectedValue = value || "";

  cy.log(`input for "${labelText}" should have value "${expectedValue}"`);
  cy.findByLabelText(labelText).should("have.value", expectedValue);
}

function assertDateInputValue(labelText, value) {
  const expectedValue = moment(value)
    .format()
    .replace(/-\d\d:\d\d$/, "");

  cy.log(`input for "${labelText}" should have value "${expectedValue}"`);
  cy.findByLabelText(labelText).should("have.value", expectedValue);
}

function assertScoreUpdatedInTable() {
  cy.log("updated quantity should be present in the table");
  cy.findByTestId("TableInteractive-root")
    .findByText(UPDATED_SCORE_FORMATTED)
    .should("exist");
}

function assertSuccessfullUpdateToast() {
  cy.log("it shows a toast informing the update was successfull");
  undoToast().within(() => {
    cy.findByText("Successfully updated").should("be.visible");
  });
}

function actionForm() {
  return cy.findByTestId("action-form");
}

function objectDetailModal() {
  return cy.findByTestId("object-detail");
}

function actionExecuteModal() {
  return cy.findByTestId("action-execute-modal");
}

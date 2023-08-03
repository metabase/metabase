import moment from "moment-timezone";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  modal,
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  undoToast,
  visitDashboard,
  visitModel,
  createModelFromTableName,
  createImplicitActions,
  setActionsEnabledForDB,
} from "e2e/support/helpers";

const WRITABLE_TEST_TABLE = "scoreboard_actions";
const FIRST_SCORE_ROW_ID = 11;
const SECOND_SCORE_ROW_ID = 12;
const UPDATED_SCORE = 987654321;
const UPDATED_SCORE_FORMATTED = "987,654,321";

const DASHBOARD = {
  name: "Test dashboard",
  database: WRITABLE_DB_ID,
};

describe("scenarios > actions > actions-in-object-detail-view", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");
    cy.intercept("GET", "/api/action/*/execute?parameters=*").as(
      "prefetchValues",
    );

    resetTestTable({ type: "postgres", table: WRITABLE_TEST_TABLE });
    restore("postgres-writable");
    asAdmin(() => {
      resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: WRITABLE_TEST_TABLE,
      });

      createModelFromTableName({
        tableName: WRITABLE_TEST_TABLE,
        idAlias: "modelId",
      });
    });
  });

  describe("in dashboard", () => {
    beforeEach(() => {
      asAdmin(() => {
        cy.get("@modelId").then(modelId => {
          createImplicitActions({ modelId });

          cy.createQuestionAndDashboard({
            questionDetails: {
              name: "Score detail",
              display: "object",
              database: WRITABLE_DB_ID,
              query: {
                "source-table": `card__${modelId}`,
              },
            },
            dashboardDetails: DASHBOARD,
          }).then(({ body: { dashboard_id } }) => {
            cy.wrap(dashboard_id).as("dashboardId");
          });
        });
      });
    });

    it("does not show model actions in model visualization on a dashboard", () => {
      asAdmin(() => {
        cy.get("@dashboardId").then(dashboardId => {
          visitDashboard(dashboardId);
        });

        cy.findByTestId("dashcard").within(() => {
          assertActionsDropdownNotExists();
        });
      });
    });
  });

  describe("in modal", () => {
    it("should be able to run update and delete actions when enabled", () => {
      cy.get("@modelId").then(modelId => {
        asNormalUser(() => {
          cy.log("As normal user: verify there are no model actions to run");
          visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownNotExists();
          });
        });

        asAdmin(() => {
          cy.log("As admin: Verify that there are no model actions to run");
          visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownNotExists();
          });

          createImplicitActions({ modelId });

          cy.log("As admin: verify there are model actions to run");
          visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownExists();
          });
        });

        asNormalUser(() => {
          cy.log("As normal user: verify there are model actions to run (1)");
          visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownExists();
          });

          cy.log("As normal user: verify update form gets prefilled");
          openUpdateObjectModal();
          actionExecuteModal().within(() => {
            cy.wait("@prefetchValues").then(request => {
              const firstScoreRow = request.response.body;

              actionForm().within(() => {
                assertScoreFormPrefilled(firstScoreRow);
              });
            });

            cy.icon("close").click();
          });
          objectDetailModal().icon("close").click();

          cy.log("As normal user: verify there are model actions to run (2)");
          visitObjectDetail(modelId, SECOND_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownExists();
          });

          cy.log(
            "As normal user: verify form gets prefilled with values for another entity and run update action",
          );
          openUpdateObjectModal();
          actionExecuteModal().within(() => {
            cy.wait("@prefetchValues").then(request => {
              const secondScoreRow = request.response.body;

              actionForm().within(() => {
                assertScoreFormPrefilled(secondScoreRow);

                cy.findByLabelText("Score").clear().type(UPDATED_SCORE);
                cy.findByText("Update").click();
              });
            });
          });
          objectDetailModal().icon("close").click();
          assertSuccessfullUpdateToast();
          assertUpdatedScoreInTable();

          cy.log("As normal user: run delete action");
          visitObjectDetail(modelId, SECOND_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownExists();
          });
          openDeleteObjectModal();
          deleteObjectModal().findByText("Delete forever").click();
          assertSuccessfullDeleteToast();
          assertUpdatedScoreNotInTable();
        });

        asAdmin(() => {
          cy.log("As admin: disable basic model actions");
          disableBasicModelActions(modelId);

          cy.log("As admin user: verify there are no model actions to run");
          visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownNotExists();
          });

          cy.log("As admin: disable database actions");
          disableDatabaseActions(WRITABLE_DB_ID);

          cy.log("As admin: verify database actions are disabled");
          visitModelDetail(modelId);
          assertActionsTabNotExists();
        });

        asNormalUser(() => {
          cy.log("As normal user: verify database actions are disabled");
          visitModelDetail(modelId);
          assertActionsTabNotExists();

          cy.log("As normal user: verify there are no model actions to run");
          visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
          objectDetailModal().within(() => {
            assertActionsDropdownNotExists();
          });
        });
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

function disableDatabaseActions(databaseId) {
  setActionsEnabledForDB(databaseId, false);
}

function disableBasicModelActions(modelId) {
  visitModelDetailActions(modelId);
  cy.findByLabelText("Actions menu").click();
  popover().findByText("Disable basic actions").click();
  modal().findByText("Disable").click();
  cy.wait("@getModelActions");
}

function visitObjectDetail(modelId, objectId) {
  visitModel(modelId);
  cy.wait("@getCard");
  cy.findByTestId("TableInteractive-root").findByText(objectId).click();
}

function visitModelDetail(modelId) {
  visitModel(modelId);
  cy.icon("info").click();
  cy.findByTestId("sidebar-right").findByText("Model details").click();
}

function visitModelDetailActions(modelId) {
  visitModelDetail(modelId);
  cy.findByText("Actions").click();
}

function openUpdateObjectModal() {
  cy.findByTestId("actions-menu").click();
  popover().findByText("Update").click();
}

function openDeleteObjectModal() {
  cy.findByTestId("actions-menu").click();
  popover().findByText("Delete").click();
}

function assertActionsDropdownExists() {
  cy.log("actions dropdown should be shown in object detail view");
  cy.findByTestId("actions-menu").should("exist");
}

function assertActionsDropdownNotExists() {
  cy.log("actions dropdown should not be shown in object detail view");
  cy.findByTestId("actions-menu").should("not.exist");
}

function assertActionsTabNotExists() {
  cy.log("actions tab should not be shown in model detail page");
  cy.findByText("Actions").should("not.exist");
}

function assertScoreFormPrefilled(object) {
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

function assertUpdatedScoreInTable() {
  cy.log("updated quantity should be present in the table");
  cy.findByTestId("TableInteractive-root")
    .findByText(UPDATED_SCORE_FORMATTED)
    .should("exist");
}

function assertUpdatedScoreNotInTable() {
  cy.log("updated quantity should not be present in the table");
  cy.findByTestId("TableInteractive-root")
    .findByText(UPDATED_SCORE_FORMATTED)
    .should("not.exist");
}

function assertSuccessfullUpdateToast() {
  cy.log("it shows a toast informing the update was successful");
  undoToast().should("have.attr", "color", "success");
  undoToast().findByText("Successfully updated").should("be.visible");
}

function assertSuccessfullDeleteToast() {
  cy.log("it shows a toast informing the delete was successful");
  undoToast().should("have.attr", "color", "success");
  undoToast().findByText("Successfully deleted").should("be.visible");
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

function deleteObjectModal() {
  return cy.findByTestId("delete-object-modal");
}

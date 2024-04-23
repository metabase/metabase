import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  visitDashboard,
  visitModel,
  createModelFromTableName,
  createImplicitActions,
  undoToastList,
} from "e2e/support/helpers";

const WRITABLE_TEST_TABLE = "scoreboard_actions";
const FIRST_SCORE_ROW_ID = 11;
const SECOND_SCORE_ROW_ID = 12;
const UPDATED_SCORE = 987654321;
const UPDATED_SCORE_FORMATTED = "987,654,321";

const { ALL_USERS_GROUP } = USER_GROUPS;

const DASHBOARD = {
  name: "Test dashboard",
  database: WRITABLE_DB_ID,
};

describe(
  "scenarios > actions > actions-in-object-detail-view",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");
      cy.intercept("POST", "/api/action/*/execute").as("executeAction");
      cy.intercept("GET", "/api/action/*/execute?parameters=*").as(
        "prefetchValues",
      );

      resetTestTable({ type: "postgres", table: WRITABLE_TEST_TABLE });
      restore("postgres-writable");
      asAdmin(() => {
        cy.updatePermissionsGraph({
          [ALL_USERS_GROUP]: {
            [WRITABLE_DB_ID]: {
              "view-data": "unrestricted",
              "create-queries": "query-builder-and-native",
            },
          },
        });

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
          visitDashboard("@dashboardId");

          cy.findByTestId("dashcard").within(() => {
            assertActionsDropdownNotExists();
          });
        });
      });
    });

    describe(
      "in modal",
      // These tests time out frequently in CI on `POST /api/dataset`
      { viewportHeight: 1200, requestTimeout: 10000 },
      () => {
        const permissionLevels = [
          {
            name: "admin",
            permissionFn: asAdmin,
          },
          {
            name: "normal",
            permissionFn: asNormalUser,
          },
        ];

        permissionLevels.forEach(({ name, permissionFn }) => {
          it(`should be able to run update and delete actions when enabled for a ${name} user`, () => {
            cy.get("@modelId").then(modelId => {
              permissionFn(() => {
                cy.log(
                  `As ${name} user: verify there are no model actions to run`,
                );
                visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
                objectDetailModal().within(() => {
                  assertActionsDropdownNotExists();
                });
              });

              asAdmin(() => {
                createImplicitActions({ modelId });
              });

              permissionFn(() => {
                cy.log(
                  `As ${name} user: verify there are model actions to run (1)`,
                );
                visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
                objectDetailModal().within(() => {
                  assertActionsDropdownExists();
                });

                cy.log(`As ${name} user: verify update form gets prefilled`);
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

                cy.log(
                  `As ${name} user: verify there are model actions to run (2)`,
                );
                openObjectDetailModal(SECOND_SCORE_ROW_ID);
                objectDetailModal().within(() => {
                  assertActionsDropdownExists();
                });

                cy.log(
                  `As ${name} user: verify form gets prefilled with values for another entity and run update action`,
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

                cy.log(`As ${name} user: run delete action`);
                openObjectDetailModal(SECOND_SCORE_ROW_ID);
                objectDetailModal().within(() => {
                  assertActionsDropdownExists();
                });
                openDeleteObjectModal();
                deleteObjectModal().findByText("Delete forever").click();
                assertSuccessfullDeleteToast();
                assertUpdatedScoreNotInTable();
              });
            });
          });
        });
      },
    );

    it("should show detailed form errors for constraint violations when executing model actions", () => {
      const actionName = "Update";

      cy.signInAsAdmin();

      cy.get("@modelId").then(modelId => {
        createImplicitActions({ modelId });
        visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
        openUpdateObjectModal();
      });

      actionExecuteModal().within(() => {
        cy.wait("@prefetchValues");

        actionForm().within(() => {
          cy.findByLabelText("Team Name").clear().type("Dusty Ducks");
          cy.findByText(actionName).click();
        });

        cy.wait("@executeAction");

        cy.findByLabelText("Team Name").should("not.exist");
        cy.findByLabelText(
          "Team Name: This Team_name value already exists.",
        ).should("exist");

        cy.findByText("Team_name already exists.").should("exist");
      });
    });
  },
);

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

function visitObjectDetail(modelId, objectId) {
  visitModel(modelId);
  cy.get("main").findByText("Loading...").should("not.exist");
  cy.findByTestId("TableInteractive-root").findByText(objectId).click();
}

function openObjectDetailModal(objectId) {
  cy.findByTestId("TableInteractive-root").findByText(objectId).click();
}

function openUpdateObjectModal() {
  cy.findByTestId("actions-menu").click();
  popover().findByText("Update").should("be.visible").click();
}

function openDeleteObjectModal() {
  cy.findByTestId("actions-menu").click();
  popover().findByText("Delete").should("be.visible").click();
}

function assertActionsDropdownExists() {
  cy.log("actions dropdown should be shown in object detail view");
  cy.findByTestId("actions-menu").should("exist");
}

function assertActionsDropdownNotExists() {
  cy.log("actions dropdown should not be shown in object detail view");
  cy.findByTestId("actions-menu").should("not.exist");
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
  undoToastList()
    .last()
    .should("be.visible")
    .should("have.attr", "color", "success")
    .should("contain.text", "Successfully updated");
}

function assertSuccessfullDeleteToast() {
  cy.log("it shows a toast informing the delete was successful");
  undoToastList()
    .last()
    .should("be.visible")
    .should("have.attr", "color", "success")
    .should("contain.text", "Successfully deleted");
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

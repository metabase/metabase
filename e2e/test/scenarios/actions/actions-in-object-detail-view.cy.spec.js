import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { dayjs } from "metabase/dayjs";

const { H } = cy;

const WRITABLE_TEST_TABLE = "scoreboard_actions";
const FIRST_SCORE_ROW_ID = 11;
const SECOND_SCORE_ROW_ID = 12;
const FIRST_SCORE_ROW = {
  id: "11",
  team_name: "Kind Koalas",
  score: "70",
  status: "active",
};
const SECOND_SCORE_ROW = {
  id: "12",
  team_name: "Lively Lemurs",
  score: "80",
  status: "active",
};
const UPDATED_SCORE = 987654321;
const UPDATED_SCORE_FORMATTED = "987,654,321";

const { ALL_USERS_GROUP } = USER_GROUPS;

describe(
  "scenarios > actions > actions-in-object-detail-view",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");
      cy.intercept("POST", "/api/action/*/execute").as("executeAction");
      cy.intercept("POST", "/api/action/*/execute/values").as("prefetchValues");

      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: WRITABLE_TEST_TABLE });
      asAdmin(() => {
        cy.updatePermissionsGraph({
          [ALL_USERS_GROUP]: {
            [WRITABLE_DB_ID]: {
              "view-data": "unrestricted",
              "create-queries": "query-builder-and-native",
            },
          },
        });

        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
          tableName: WRITABLE_TEST_TABLE,
        });

        H.createModelFromTableName({
          tableName: WRITABLE_TEST_TABLE,
          idAlias: "modelId",
        });
      });
    });

    describe(
      "in modal",
      // These tests time out frequently in CI on `POST /api/dataset`
      { viewportHeight: 1200, requestTimeout: 10000 },
      () => {
        it("should be able to run update and delete actions when enabled", () => {
          cy.get("@modelId").then((modelId) => {
            asNormalUser(() => {
              cy.log(
                "As normal user: verify there are no model actions to run",
              );
              visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
              objectDetailModal()
                .should("be.visible")
                .and("contain.text", FIRST_SCORE_ROW.team_name);
              cy.wait("@getModelActions");
              objectDetailModal().within(() => {
                assertActionsDropdownNotExists();
              });
            });

            asAdmin(() => {
              H.createImplicitActions({ modelId });
            });

            asNormalUser(() => {
              cy.log(
                "As normal user: verify there are model actions to run (1)",
              );
              visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
              objectDetailModal().within(() => {
                assertActionsDropdownExists();
              });

              cy.log(
                "does not close object detail modal when pressing Esc while action modal is open",
              );
              openUpdateObjectModal();
              cy.wait("@prefetchValues");
              actionExecuteModal().should("be.visible");
              cy.realPress("Escape");
              actionExecuteModal().should("not.exist");
              objectDetailModal().should("be.visible");

              cy.log("As normal user: verify update form gets prefilled");
              openUpdateObjectModal();
              actionExecuteModal().within(() => {
                cy.wait("@prefetchValues").then((request) => {
                  actionForm().within(() => {
                    assertScoreFormPrefilled(
                      FIRST_SCORE_ROW,
                      request.response.body,
                    );
                  });
                });

                cy.log(
                  "As normal user: verify detailed form errors for constraint violations",
                );
                actionForm().within(() => {
                  cy.findByLabelText("Team Name").clear().type("Dusty Ducks");
                  cy.findByText("Update").click();
                });

                cy.wait("@executeAction");

                cy.findByLabelText("Team Name").should("exist");
                cy.findByText("This Team_name value already exists.").should(
                  "exist",
                );

                cy.findByText("Team_name already exists.").should("exist");

                cy.button("Close").click();
              });
              objectDetailModal().icon("close").click();

              cy.log(
                "As normal user: verify there are model actions to run (2)",
              );
              openObjectDetailModal(SECOND_SCORE_ROW_ID);
              objectDetailModal().within(() => {
                assertActionsDropdownExists();
              });

              cy.log(
                "As normal user: verify form gets prefilled with values for another entity and run update action",
              );
              openUpdateObjectModal();
              actionExecuteModal().within(() => {
                cy.wait("@prefetchValues").then((request) => {
                  actionForm().within(() => {
                    assertScoreFormPrefilled(
                      SECOND_SCORE_ROW,
                      request.response.body,
                    );

                    cy.findByLabelText("Score").clear().type(UPDATED_SCORE);
                    cy.findByText("Update").click();
                  });
                });
              });
              objectDetailModal().icon("close").click();
              assertSuccessfullUpdateToast();
              assertUpdatedScoreInTable();

              cy.log("As normal user: run delete action");
              openObjectDetailModal(SECOND_SCORE_ROW_ID);
              objectDetailModal().within(() => {
                assertActionsDropdownExists();
              });
              openDeleteObjectModal();
              deleteObjectModal().findByText("Delete forever").click();
              assertSuccessfullDeleteToast();
              assertUpdatedScoreNotInTable();
            });

            asAdmin(() => {
              cy.log("As admin user: run delete action");
              visitObjectDetail(modelId, FIRST_SCORE_ROW_ID);
              objectDetailModal().within(() => {
                assertActionsDropdownExists();
              });
              H.tableInteractive()
                .findByText(FIRST_SCORE_ROW.team_name)
                .should("exist");
              openDeleteObjectModal();
              deleteObjectModal().findByText("Delete forever").click();
              assertSuccessfullDeleteToast();
              H.tableInteractive()
                .findByText(FIRST_SCORE_ROW.team_name)
                .should("not.exist");
            });
          });
        });
      },
    );
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
  H.visitModel(modelId);
  cy.get("main").findByText("Loading...").should("not.exist");
  H.tableInteractive().findByText(objectId).click();
}

function openObjectDetailModal(objectId) {
  H.tableInteractive().findByText(objectId).click();
}

function openUpdateObjectModal() {
  cy.findByTestId("actions-menu").click();
  H.popover().findByText("Update").should("be.visible").click();
}

function openDeleteObjectModal() {
  cy.findByTestId("actions-menu").click();
  H.popover().findByText("Delete").should("be.visible").click();
}

function assertActionsDropdownExists() {
  cy.log("actions dropdown should be shown in object detail view");
  cy.findByTestId("actions-menu").should("exist");
}

function assertActionsDropdownNotExists() {
  cy.log("actions dropdown should not be shown in object detail view");
  cy.findByTestId("actions-menu").should("not.exist");
}

function assertScoreFormPrefilled(expected, prefetchedRow) {
  assertInputValue("ID", expected.id);
  assertInputValue("Team Name", expected.team_name);
  assertInputValue("Score", expected.score);
  assertInputValue("Status", expected.status);
  assertDateInputValue("Created At", prefetchedRow.created_at);
  assertDateInputValue("Updated At", prefetchedRow.updated_at);
}

function assertInputValue(labelText, value) {
  const expectedValue = value || "";

  cy.log(`input for "${labelText}" should have value "${expectedValue}"`);
  cy.findByLabelText(labelText).should("have.value", expectedValue);
}

function assertDateInputValue(labelText, value) {
  const expectedValue = dayjs(value)
    .format()
    .replace(/-\d\d:\d\d$/, "");

  cy.log(`input for "${labelText}" should have value "${expectedValue}"`);
  cy.findByLabelText(labelText).should("have.value", expectedValue);
}

function assertUpdatedScoreInTable() {
  cy.log("updated quantity should be present in the table");
  H.tableInteractive().findByText(UPDATED_SCORE_FORMATTED).should("exist");
}

function assertUpdatedScoreNotInTable() {
  cy.log("updated quantity should not be present in the table");
  H.tableInteractive().findByText(UPDATED_SCORE_FORMATTED).should("not.exist");
}

function assertSuccessfullUpdateToast() {
  cy.log("it shows a toast informing the update was successful");
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.undoToastList()
    .last()
    .should("be.visible")
    .should("contain.text", "Successfully updated");
}

function assertSuccessfullDeleteToast() {
  cy.log("it shows a toast informing the delete was successful");
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.undoToastList()
    .last()
    .should("be.visible")
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

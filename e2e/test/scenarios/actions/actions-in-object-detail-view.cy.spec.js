import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visitModel } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const modelObjectId = 11;

const ordersModel = {
  name: "Orders model",
  dataset: true,
  display: "table",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
};

describe("Model actions in object detail view", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/action").as("createBasicActions");

    restore();
    cy.signInAsNormalUser();
    cy.createQuestion(ordersModel, { wrapId: true, idAlias: "modelId" });
    cy.signOut();
  });

  it("scenario", () => {
    cy.get("@modelId").then(modelId => {
      asNormalUser(() => {
        assertActionsTabNotExists(modelId);
        assertActionsDropdownNotExists(modelId, modelObjectId);
      });

      asAdmin(() => {
        assertActionsTabNotExists(modelId);
        assertActionsDropdownNotExists(modelId, modelObjectId);

        enableDatabaseActions();

        assertActionsTabExists(modelId);
        assertActionsDropdownNotExists(modelId, modelObjectId);
      });

      asNormalUser(() => {
        assertActionsTabExists(modelId);
        assertActionsDropdownNotExists(modelId, modelObjectId);
      });

      asAdmin(() => {
        createBasicModelActions(modelId);

        assertActionsDropdownExists(modelId, modelObjectId);
      });

      asNormalUser(() => {
        assertActionsDropdownExists(modelId, modelObjectId);

        openUpdateObjectModal(modelId, modelObjectId);

        assertUpdateModalPrefilled();
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

function assertActionsDropdownExists(modelId, objectId) {
  visitModel(modelId);
  cy.findByText(objectId).click();
  cy.log("actions dropdown should be shown in object details modal");
  cy.findByTestId("actions-menu").should("exist");
}

function openUpdateObjectModal(modelId, objectId) {
  visitModel(modelId);
  cy.findByText(objectId).click();
  cy.findByTestId("actions-menu").click();
  cy.findByText("Update").click();
}

function assertActionsDropdownNotExists(modelId, objectId) {
  visitModel(modelId);
  cy.findByText(objectId).click();
  cy.log("actions dropdown should not be shown in object details modal");
  cy.findByTestId("actions-menu").should("not.exist");
}

function assertActionsTabExists(modelId) {
  cy.visit(`/model/${modelId}/detail`);
  cy.log("actions tab should be shown in model detail page");
  cy.findByText("Actions").should("exist");
}

function assertActionsTabNotExists(modelId) {
  cy.visit(`/model/${modelId}/detail`);
  cy.log("actions tab should be shown in model detail page");
  cy.findByText("Actions").should("not.exist");
}

function assertUpdateModalPrefilled() {}

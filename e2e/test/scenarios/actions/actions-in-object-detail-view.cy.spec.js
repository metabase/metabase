import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visitModel } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ordersModel = {
  name: "Orders model",
  dataset: true,
  display: "table",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
};

const order11 = {
  active_subscription: true,
  country: "TZ",
  legacy_plan: false,
  longitude: 33.08333,
  id: 11,
  email: "leannon-clay@gmail.example",
  latitude: -2.85,
  seats: 8,
  last_name: "Leannon",
  first_name: "Clay",
  source: "Twitter",
  trial_converted: true,
  created_at: "2020-09-29T03:34:24+07:00",
  plan: "Basic",
  trial_ends_at: "2020-10-13T12:00:00+07:00",
  canceled_at: null,
};

describe("Model actions in object detail view", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/action").as("createBasicActions");
    cy.intercept("GET", "/api/action/*/execute").as("prefetchValues");

    restore();
    cy.signInAsNormalUser();
    cy.createQuestion(ordersModel, { wrapId: true, idAlias: "modelId" });
    cy.signOut();
  });

  it("scenario", () => {
    cy.get("@modelId").then(modelId => {
      asNormalUser(() => {
        assertActionsTabNotExists(modelId);
        assertActionsDropdownNotExists(modelId, order11.id);
      });

      asAdmin(() => {
        assertActionsTabNotExists(modelId);
        assertActionsDropdownNotExists(modelId, order11.id);

        enableDatabaseActions();

        assertActionsTabExists(modelId);
        assertActionsDropdownNotExists(modelId, order11.id);
      });

      asNormalUser(() => {
        assertActionsTabExists(modelId);
        assertActionsDropdownNotExists(modelId, order11.id);
      });

      asAdmin(() => {
        createBasicModelActions(modelId);

        assertActionsDropdownExists(modelId, order11.id);
      });

      asNormalUser(() => {
        assertActionsDropdownExists(modelId, order11.id);

        openUpdateObjectModal(modelId, order11.id);

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

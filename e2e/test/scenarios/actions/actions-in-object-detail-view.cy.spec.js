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
  total: 67.33421061366487,
  product_id: 76,
  user_id: 1,
  discount: null,
  id: 11,
  quantity: 6,
  subtotal: 63.82421061366486,
  created_at: "2024-07-22T20:31:01.969-07:00",
  tax: 3.51,
};

const order12 = {
  total: 158.4190052655229,
  product_id: 7,
  user_id: 3,
  discount: null,
  id: 12,
  quantity: 7,
  subtotal: 148.22900526552291,
  created_at: "2024-06-26T23:21:13.271-07:00",
  tax: 10.19,
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
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabNotExists(modelId);

        visitObjectDetails(modelId, order11.id);
        assertActionsDropdownNotExists();
      });

      asAdmin(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabNotExists(modelId);

        visitObjectDetails(modelId, order11.id);
        assertActionsDropdownNotExists();

        enableDatabaseActions();

        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabExists(modelId);

        visitObjectDetails(modelId, order11.id);
        assertActionsDropdownNotExists();
      });

      asNormalUser(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabExists(modelId);

        visitObjectDetails(modelId, order11.id);
        assertActionsDropdownNotExists();
      });

      asAdmin(() => {
        createBasicModelActions(modelId);
        visitObjectDetails(modelId, order11.id);
        assertActionsDropdownExists();
      });

      asNormalUser(() => {
        visitObjectDetails(modelId, order11.id);
        assertActionsDropdownExists();
        openUpdateObjectModal(modelId, order11.id);
        assertOrderFormPrefilled(order11);
        cy.icon("close").last().click();
        cy.icon("close").last().click();

        visitObjectDetails(modelId, order12.id);
        assertActionsDropdownExists();
        openUpdateObjectModal(modelId, order12.id);
        assertOrderFormPrefilled(order12);
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

function visitObjectDetails(modelId, objectId) {
  visitModel(modelId);
  cy.findAllByText(objectId).first().click();
}

function openUpdateObjectModal(modelId, objectId) {
  visitModel(modelId);
  cy.findAllByText(objectId).first().click();
  cy.findByTestId("actions-menu").click();
  cy.findByText("Update").click();
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
  cy.log("actions tab should be shown in model detail page");
  cy.findByText("Actions").should("not.exist");
}

function assertOrderFormPrefilled(object) {
  assertInputValue("ID", object.id);
  assertInputValue("User ID", object.user_id);
  assertInputValue("Product ID", object.product_id);
  assertInputValue("Subtotal", object.subtotal);
  assertInputValue("Tax", object.tax);
  assertInputValue("Total", object.total);
  assertInputValue("Discount", object.discount);
  assertInputValue("Created At", dateToIso(object.created_at));
  assertInputValue("Quantity", object.quantity);
}

function assertInputValue(labelText, value) {
  const expectedValue = value || "";
  cy.log(`Input for "${labelText}" should have value "${expectedValue}"`);
  cy.findByLabelText(labelText).should("have.value", expectedValue);
}

/**
 * Turns "2024-07-22T20:31:01.969-07:00" into "2024-07-22T20:31:01"
 */
function dateToIso(timestamp) {
  return timestamp.replace(/\..*/, "");
}

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { popover, restore, undoToast, visitModel } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_MODEL = {
  name: "Orders model",
  dataset: true,
  display: "table",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
};

const ORDER_11 = {
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

const ORDER_12 = {
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

const UPDATED_QUANTITY = 987654321;
const UPDATED_QUANTITY_FORMATTED = "987,654,321";

describe("Model actions in object detail view", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/action").as("createBasicActions");
    cy.intercept("GET", "/api/action/*/execute").as("prefetchValues");

    restore();
    cy.signInAsNormalUser();
    cy.createQuestion(ORDERS_MODEL, { wrapId: true, idAlias: "modelId" });
    cy.signOut();
  });

  it("scenario", () => {
    cy.get("@modelId").then(modelId => {
      asNormalUser(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabNotExists(modelId);

        visitObjectDetail(modelId, ORDER_11.id);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });
      });

      asAdmin(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabNotExists(modelId);

        visitObjectDetail(modelId, ORDER_11.id);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });

        enableDatabaseActions();

        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabExists(modelId);

        visitObjectDetail(modelId, ORDER_11.id);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });
      });

      asNormalUser(() => {
        cy.visit(`/model/${modelId}/detail`);
        assertActionsTabExists(modelId);

        visitObjectDetail(modelId, ORDER_11.id);
        objectDetailModal().within(() => {
          assertActionsDropdownNotExists();
        });
      });

      asAdmin(() => {
        createBasicModelActions(modelId);

        visitObjectDetail(modelId, ORDER_11.id);
        objectDetailModal().within(() => {
          assertActionsDropdownExists();
        });
      });

      asNormalUser(() => {
        visitObjectDetail(modelId, ORDER_11.id);
        objectDetailModal().within(() => {
          assertActionsDropdownExists();
        });

        openUpdateObjectModal();
        actionExecuteModal().within(() => {
          actionForm().within(() => {
            assertOrderFormPrefilled(ORDER_11);
          });

          cy.icon("close").click();
        });
        objectDetailModal().icon("close").click();

        visitObjectDetail(modelId, ORDER_12.id);
        objectDetailModal().within(() => {
          assertActionsDropdownExists();
        });

        openUpdateObjectModal();
        actionExecuteModal().within(() => {
          actionForm().within(() => {
            assertOrderFormPrefilled(ORDER_12);

            cy.findByLabelText("Quantity").clear().type(UPDATED_QUANTITY);
            cy.findByText("Update").click();
          });
        });
        objectDetailModal().icon("close").click();

        assertSuccessfullUpdateToast();

        cy.log("updated quantity should be present in the table");
        cy.findByText(UPDATED_QUANTITY_FORMATTED).should("exist");
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
  cy.log(`input for "${labelText}" should have value "${expectedValue}"`);
  cy.findByLabelText(labelText).should("have.value", expectedValue);
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

/**
 * Turns "2024-07-22T20:31:01.969-07:00" into "2024-07-22T20:31:01"
 */
function dateToIso(timestamp) {
  return timestamp.replace(/\..*/, "");
}

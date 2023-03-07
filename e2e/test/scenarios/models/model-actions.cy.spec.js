import {
  createAction,
  describeEE,
  enableActionsForDB,
  fillActionQuery,
  modal,
  popover,
  restore,
} from "e2e/support/helpers";

import { createMockActionParameter } from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SAMPLE_ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
};

const TEST_PARAMETER = createMockActionParameter({
  id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
  name: "ID",
  slug: "id",
  type: "number/=",
  target: ["variable", ["template-tag", "id"]],
});

const TEST_TEMPLATE_TAG = {
  id: TEST_PARAMETER.id,
  type: "number",
  name: TEST_PARAMETER.slug,
  "display-name": "Id",
  slug: TEST_PARAMETER.slug,
};

const SAMPLE_QUERY_ACTION = {
  name: "Demo Action",
  type: "query",
  parameters: [TEST_PARAMETER],
  database_id: SAMPLE_DB_ID,
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ORDERS SET TOTAL = TOTAL WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
      "template-tags": {
        [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
      },
    },
    database: SAMPLE_DB_ID,
  },
  visualization_settings: {
    fields: {
      [TEST_PARAMETER.id]: {
        id: TEST_PARAMETER.id,
        required: true,
        fieldType: "number",
        inputType: "number",
      },
    },
  },
};

describe("scenarios > models > actions", { tags: ["@actions"] }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    enableActionsForDB(SAMPLE_DB_ID);

    cy.createQuestion(SAMPLE_ORDERS_MODEL, {
      wrapId: true,
      idAlias: "modelId",
    });

    cy.intercept("GET", "/api/card/*").as("getModel");
    cy.intercept("PUT", "/api/action/*").as("updateAction");
    cy.signOut();
  });

  describe("should allow to view, create, edit, and archive model actions", () => {
    ["normal"].forEach(user => {
      it(user, () => {
        cy.get("@modelId").then(id => {
          cy.signIn(user);
          cy.visit(`/model/${id}/detail`);
          cy.wait("@getModel");
        });

        cy.findByText("Actions").click();

        cy.findByRole("button", { name: /Create basic actions/i }).click();
        cy.findByLabelText("Action list").within(() => {
          cy.findByText("Create").should("be.visible");
          cy.findByText("Update").should("be.visible");
          cy.findByText("Delete").should("be.visible");
        });

        cy.findByRole("link", { name: "New action" }).click();
        fillActionQuery("DELETE FROM orders WHERE id = {{ id }}");
        cy.findByRole("radiogroup", { name: "Field type" })
          .findByText("Number")
          .click();
        cy.findByRole("button", { name: "Save" }).click();
        modal().within(() => {
          cy.findByLabelText("Name").type("Delete Order");
          cy.findByRole("button", { name: "Create" }).click();
        });
        cy.findByLabelText("Action list")
          .findByText("Delete Order")
          .should("be.visible");

        openActionEditorFor("Delete Order");
        fillActionQuery(" AND status = 'pending'");
        cy.findByRole("radiogroup", { name: "Field type" })
          .findByLabelText("Number")
          .should("be.checked");
        cy.findByRole("button", { name: "Update" }).click();

        cy.findByLabelText("Action list")
          .findByText(
            "DELETE FROM orders WHERE id = {{ id }} AND status = 'pending'",
          )
          .should("be.visible");

        openActionMenuFor("Delete Order");
        popover().findByText("Archive").click();

        modal().within(() => {
          cy.findByText("Archive Delete Order?").should("be.visible");
          cy.findByRole("button", { name: "Archive" }).click();
        });

        cy.findByRole("listitem", { name: "Delete Order" }).should("not.exist");

        cy.findByLabelText("Actions menu").click();
        popover().findByText("Disable basic actions").click();
        modal().within(() => {
          cy.findByText("Disable basic actions?").should("be.visible");
          cy.button("Disable").click();
        });
        cy.findByLabelText("Action list").should("not.exist");
        cy.findByText("Create").should("not.exist");
        cy.findByText("Update").should("not.exist");
        cy.findByText("Delete").should("not.exist");
      });
    });
  });

  describe("should allow to execute actions from the model page", () => {
    ["normal", "readonly"].forEach(user => {
      it(user, () => {
        cy.get("@modelId").then(modelId => {
          cy.signInAsNormalUser();
          createAction({
            ...SAMPLE_QUERY_ACTION,
            model_id: modelId,
          });
          cy.signIn(user);
          cy.visit(`/model/${modelId}/detail/actions`);
          cy.wait("@getModel");
        });

        runActionFor(SAMPLE_QUERY_ACTION.name);

        modal().within(() => {
          cy.findByLabelText(TEST_PARAMETER.name).type("1");
          cy.button("Run").click();
        });

        cy.findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`).should(
          "be.visible",
        );
      });
    });
  });
});

describeEE("scenarios > models > actions", { tags: ["@actions"] }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    enableActionsForDB(SAMPLE_DB_ID);

    cy.createQuestion(SAMPLE_ORDERS_MODEL, {
      wrapId: true,
      idAlias: "modelId",
    });

    cy.intercept("GET", "/api/card/*").as("getModel");
    cy.intercept("PUT", "/api/action/*").as("updateAction");
    cy.signOut();
  });

  describe("should allow to execute actions from the model page", () => {
    ["sandboxed"].forEach(user => {
      it(user, () => {
        cy.get("@modelId").then(modelId => {
          cy.signInAsNormalUser();
          createAction({
            ...SAMPLE_QUERY_ACTION,
            model_id: modelId,
          });
          cy.signIn(user);
          cy.visit(`/model/${modelId}/detail/actions`);
          cy.wait("@getModel");
        });

        runActionFor(SAMPLE_QUERY_ACTION.name);

        modal().within(() => {
          cy.findByLabelText(TEST_PARAMETER.name).type("1");
          cy.button("Run").click();
        });

        cy.findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`).should(
          "be.visible",
        );
      });
    });
  });
});

function runActionFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("play").click();
  });
}

function openActionMenuFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("ellipsis").click();
  });
}

function openActionEditorFor(actionName, { isReadOnly = false } = {}) {
  openActionMenuFor(actionName);
  popover()
    .findByText(isReadOnly ? "View" : "Edit")
    .click();
}

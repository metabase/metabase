import {
  enableActionsForDB,
  modal,
  popover,
  restore,
  fillActionQuery,
  createAction,
} from "e2e/support/helpers";

import { createMockActionParameter } from "metabase-types/api/mocks";

const PG_DB_ID = 2;
const PG_ORDERS_TABLE_ID = 9;

const SAMPLE_ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  database: PG_DB_ID,
  query: {
    "source-table": PG_ORDERS_TABLE_ID,
  },
};

const TEST_PARAMETER = createMockActionParameter({
  id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
  name: "Total",
  slug: "total",
  type: "number/=",
  target: ["variable", ["template-tag", "total"]],
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
  database_id: PG_DB_ID,
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ORDERS SET TOTAL = TOTAL WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
      "template-tags": {
        [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
      },
    },
    database: PG_DB_ID,
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

describe(
  "scenarios > models > actions",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();
      enableActionsForDB(PG_DB_ID);

      cy.createQuestion(SAMPLE_ORDERS_MODEL, {
        wrapId: true,
        idAlias: "modelId",
      });

      cy.intercept("GET", "/api/card/*").as("getModel");
      cy.intercept("PUT", "/api/action/*").as("updateAction");
    });

    it("should allow to view, create, edit, and archive model actions", () => {
      cy.get("@modelId").then(id => {
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
      fieldSettings().findByText("Number").click();
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
      fieldSettings()
        .findByRole("radiogroup", { name: "Field type" })
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

    it("should allow to create an action with the New button", () => {
      const QUERY = "UPDATE orders SET discount = {{ discount }}";
      cy.visit("/");

      cy.findByText("New").click();
      popover().findByText("Action").click();

      cy.findByText("Select a database").click();
      popover().within(() => {
        cy.findByText("Sample Database").should("not.exist");
        cy.findByText("QA Postgres12").click();
      });

      fillActionQuery(QUERY);
      cy.findByText(/New Action/)
        .clear()
        .type("Discount order");
      cy.findByRole("button", { name: "Save" }).click();
      modal().within(() => {
        cy.findByText("Select a model").click();
      });
      popover().findByText(SAMPLE_ORDERS_MODEL.name).click();
      cy.findByRole("button", { name: "Create" }).click();

      cy.get("@modelId").then(modelId => {
        cy.url().should("include", `/model/${modelId}/detail/actions`);
      });
      cy.findByText("Discount order").should("be.visible");
      cy.findByText(QUERY).should("be.visible");
    });

    it("should allow to execute actions from the model page", () => {
      cy.get("@modelId").then(modelId => {
        createAction({
          ...SAMPLE_QUERY_ACTION,
          model_id: modelId,
        });
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

    it("should allow to make actions public and execute them", () => {
      const IMPLICIT_ACTION_NAME = "Update order";

      cy.get("@modelId").then(modelId => {
        createAction({
          ...SAMPLE_QUERY_ACTION,
          model_id: modelId,
        });
        createAction({
          type: "implicit",
          kind: "row/update",
          name: IMPLICIT_ACTION_NAME,
          model_id: modelId,
        });
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      enableSharingFor(SAMPLE_QUERY_ACTION.name, {
        publicUrlAlias: "queryActionPublicUrl",
      });
      enableSharingFor(IMPLICIT_ACTION_NAME, {
        publicUrlAlias: "implicitActionPublicUrl",
      });

      cy.signOut();

      cy.get("@queryActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.findByRole("button", { name: "Submit" }).click();
        cy.findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`).should(
          "be.visible",
        );
        cy.findByRole("form").should("not.exist");
        cy.findByRole("button", { name: "Submit" }).should("not.exist");
      });

      cy.get("@implicitActionPublicUrl").then(url => {
        cy.visit(url);

        // Order 1 has quantity 2 by default, so we're not actually mutating data
        cy.findByLabelText("Id").type("1");
        cy.findByLabelText(/quantity/i).type("2");

        cy.findByRole("button", { name: "Submit" }).click();
        cy.findByText(`${IMPLICIT_ACTION_NAME} ran successfully`).should(
          "be.visible",
        );
        cy.findByRole("form").should("not.exist");
        cy.findByRole("button", { name: "Submit" }).should("not.exist");
      });

      cy.signInAsAdmin();
      cy.get("@modelId").then(modelId => {
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      disableSharingFor(SAMPLE_QUERY_ACTION.name);
      disableSharingFor(IMPLICIT_ACTION_NAME);

      cy.get("@queryActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByRole("form").should("not.exist");
        cy.findByRole("button", { name: "Submit" }).should("not.exist");
        cy.findByText("An error occurred.").should("be.visible");
      });

      cy.get("@implicitActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByRole("form").should("not.exist");
        cy.findByRole("button", { name: "Submit" }).should("not.exist");
        cy.findByText("An error occurred.").should("be.visible");
      });
    });

    it("should respect permissions", () => {
      cy.get("@modelId").then(modelId => {
        cy.request("POST", "/api/action", {
          ...SAMPLE_QUERY_ACTION,
          model_id: modelId,
        });
        cy.signIn("readonly");
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      openActionMenuFor(SAMPLE_QUERY_ACTION.name);
      popover().within(() => {
        cy.findByText("Archive").should("not.exist");
        cy.findByText("View").click();
      });

      cy.findByRole("dialog").within(() => {
        cy.findByDisplayValue(SAMPLE_QUERY_ACTION.name).should("be.disabled");

        cy.button("Save").should("not.exist");
        cy.button("Update").should("not.exist");

        assertQueryEditorDisabled();

        cy.findByRole("form").within(() => {
          cy.icon("gear").should("not.exist");
        });

        cy.findByLabelText("Action settings").click();
        cy.findByLabelText("Success message").should("be.disabled");
      });
    });
  },
);

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

function assertQueryEditorDisabled() {
  // Ace doesn't act as a normal input, so we can't use `should("be.disabled")`
  // Instead we'd assert that a user can't type in the editor
  fillActionQuery("QWERTY");
  cy.findByText("QWERTY").should("not.exist");
}

function fieldSettings() {
  cy.findByTestId("action-form-editor").within(() => cy.icon("gear").click());
  return popover();
}

function enableSharingFor(actionName, { publicUrlAlias }) {
  openActionEditorFor(actionName);

  cy.findByRole("dialog").within(() => {
    cy.button("Action settings").click();
    cy.findByLabelText("Make public").should("not.be.checked").click();
    cy.findByLabelText("Public action form URL")
      .invoke("val")
      .then(url => {
        cy.wrap(url).as(publicUrlAlias);
      });
    cy.button("Cancel").click();
  });
}

function disableSharingFor(actionName) {
  openActionEditorFor(actionName);
  cy.findByRole("dialog").within(() => {
    cy.findByRole("button", { name: "Action settings" }).click();
    cy.findByLabelText("Make public").should("be.checked").click();
  });
  modal().within(() => {
    cy.findByText("Disable this public link?").should("be.visible");
    cy.findByRole("button", { name: "Yes" }).click();
  });
  cy.findByRole("dialog").within(() => {
    cy.button("Cancel").click();
  });
}

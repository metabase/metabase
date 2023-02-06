import {
  enableActionsForDB,
  modal,
  popover,
  restore,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_TABLES } from "__support__/e2e/cypress_data";
import { createMockActionParameter } from "metabase-types/api/mocks";

const PG_DB_ID = 2;

const SAMPLE_ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  query: {
    "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
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
  "display-name": "Total",
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
      query: `DELETE FROM orders WHERE total < {{ ${TEST_TEMPLATE_TAG.name} }}`,
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

describe("scenarios > models > actions", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    enableActionsForDB();
    enableActionsForDB(PG_DB_ID);

    cy.createQuestion(SAMPLE_ORDERS_MODEL, {
      wrapId: true,
      idAlias: "modelId",
    });

    cy.intercept("/api/card/*").as("getModel");
  });

  it("should allow to view, create and edit model actions", () => {
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

    cy.findByRole("button", { name: "New action" }).click();
    fillQuery("DELETE FROM orders WHERE id = {{ id }}");
    fieldSettings().findByText("number").click();
    cy.findByRole("button", { name: "Save" }).click();
    modal().within(() => {
      cy.findByLabelText("Name").type("Delete Order");
      cy.findByRole("button", { name: "Create" }).click();
    });
    cy.findByLabelText("Action list")
      .findByText("Delete Order")
      .should("be.visible");

    openActionEditorFor("Delete Order");
    fillQuery(" AND status = 'pending'");
    fieldSettings()
      .findByRole("radiogroup", { name: "Field type" })
      .findByLabelText("number")
      .should("be.checked");
    cy.findByRole("button", { name: "Update" }).click();

    cy.findByLabelText("Action list")
      .findByText(
        "DELETE FROM orders WHERE id = {{ id }} AND status = 'pending'",
      )
      .should("be.visible");
  });

  it("should allow to make actions public and execute them", () => {
    cy.intercept("/api/public/action/*/execute", request => {
      expect(request.body).to.deep.equal({
        parameters: { [TEST_PARAMETER.id]: -2 },
      });
    });

    cy.get("@modelId").then(modelId => {
      cy.request("POST", "/api/action", {
        ...SAMPLE_QUERY_ACTION,
        model_id: modelId,
      });
      cy.visit(`/model/${modelId}/detail`);
      cy.wait("@getModel");
    });

    cy.findByText("Actions").click();
    openActionEditorFor(SAMPLE_QUERY_ACTION.name);

    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: "Action settings" }).click();
      cy.findByLabelText("Make public").should("not.be.checked").click();
      cy.findByLabelText("Public action link URL")
        .invoke("val")
        .then(url => {
          cy.wrap(url).as("publicUrl");
        });
    });

    cy.get("@publicUrl").then(url => {
      cy.signOut();
      cy.visit(url);
    });

    cy.findByLabelText(TEST_PARAMETER.name).type("-2");
    cy.findByRole("button", { name: "Submit" }).click();
    cy.findByText("Thanks for your submission.").should("be.visible");
    cy.findByRole("form").should("not.exist");
    cy.findByRole("button", { name: "Submit" }).should("not.exist");

    cy.signInAsAdmin();
    cy.get("@modelId").then(modelId => {
      cy.visit(`/model/${modelId}/detail`);
      cy.wait("@getModel");
    });

    cy.findByText("Actions").click();
    openActionEditorFor(SAMPLE_QUERY_ACTION.name);

    cy.findByRole("dialog").within(() => {
      cy.findByRole("button", { name: "Action settings" }).click();
      cy.findByLabelText("Make public").should("be.checked").click();
    });
    modal().within(() => {
      cy.findByText("Disable this public link?").should("be.visible");
      cy.findByRole("button", { name: "Yes" }).click();
    });

    cy.get("@publicUrl").then(url => {
      cy.visit(url);
      cy.findByRole("form").should("not.exist");
      cy.findByRole("button", { name: "Submit" }).should("not.exist");
      cy.findByText("An error occurred.").should("be.visible");
    });
  });
});

function openActionEditorFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("pencil").click();
  });
}

function fillQuery(query) {
  cy.get(".ace_content").type(query, { parseSpecialCharSequences: false });
}

function fieldSettings() {
  cy.findByTestId("action-form-editor").within(() => cy.icon("gear").click());
  return popover();
}

import {
  enableActionsForDB,
  modal,
  popover,
  restore,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_TABLES } from "__support__/e2e/cypress_data";

const SAMPLE_ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  query: {
    "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
  },
};

describe("scenarios > models > actions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    enableActionsForDB();

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
    fieldSettings()
      .findByText(/Number/i)
      .click();
    cy.findByRole("button", { name: "Save" }).click();
    modal().within(() => {
      cy.findByLabelText("Name").type("Delete Order");
      cy.findByRole("button", { name: "Create" }).click();
    });
    cy.findByLabelText("Action list")
      .findByText("Delete Order")
      .should("be.visible");

    cy.findByRole("listitem", { name: "Delete Order" }).within(() =>
      cy.icon("pencil").click(),
    );
    fillQuery(" AND status = 'pending'");
    fieldSettings()
      .findByRole("radiogroup", { name: /Field type/i })
      .findByLabelText(/Number/i)
      .should("be.checked");
    cy.findByRole("button", { name: "Update" }).click();

    cy.findByLabelText("Action list")
      .findByText(
        "DELETE FROM orders WHERE id = {{ id }} AND status = 'pending'",
      )
      .should("be.visible");
  });
});

function fillQuery(query) {
  cy.get(".ace_content").type(query, { parseSpecialCharSequences: false });
}

function fieldSettings() {
  cy.findByTestId("action-form-editor").within(() => cy.icon("gear").click());
  return popover();
}

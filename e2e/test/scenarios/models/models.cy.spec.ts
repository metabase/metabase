const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import {
  assertIsModel,
  assertQuestionIsBasedOnModel,
  saveQuestionBasedOnModel,
  turnIntoModel,
} from "./helpers/e2e-models-helpers";

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > models", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows to turn a GUI question into a model", () => {
    H.createQuestion(
      {
        name: "Products Model",
        query: { "source-table": PRODUCTS_ID },
      },
      { visitQuestion: true },
    );

    turnIntoModel();
    H.openQuestionActions();
    assertIsModel();

    H.filter();
    H.popover().findByText("Vendor").click();
    H.selectFilterOperator("Contains");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("Fisher");
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");

    assertQuestionIsBasedOnModel({
      model: "Products Model",
      collection: "Our analytics",
      table: "Products",
    });

    saveQuestionBasedOnModel({ name: "Q1" });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "Products Model",
      collection: "Our analytics",
      table: "Products",
    });
    cy.location("pathname").should("match", /^\/question\/\d+-q1$/);

    cy.findByTestId("qb-header").findAllByText("Our analytics").first().click();
    cy.location("pathname").should("eq", "/collection/root");
    getCollectionItemRow("Products Model").icon("model");
    getCollectionItemRow("Q1").icon("table2");
  });

  it("should allow adding models to dashboards", () => {
    const modelName = "Orders Model 2";
    H.createQuestion({
      name: modelName,
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
      type: "model",
    });

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
      H.editDashboard();
      H.openQuestionsSidebar();
      H.sidebar().findByText(modelName).click();
      H.getDashboardCard().within(() => {
        cy.findByText(modelName);
        cy.findByText("37.65");
      });
      H.saveDashboard();
      H.getDashboardCard().within(() => {
        cy.findByText(modelName);
        cy.findByText("37.65");
      });
    });
  });

  describe("create", () => {
    it("creates a native query model", () => {
      cy.intercept("POST", "/api/card").as("createModel");

      cy.visit("/browse/models");
      cy.findByLabelText("Create a new model").click();
      cy.findByTestId("new-model-options")
        .findByText("Use a native query")
        .click();

      H.NativeEditor.focus().type("select 42");

      cy.log("the editor should not overflow its container (metabase#69722)");
      H.NativeEditor.type("{enter}".repeat(20));
      cy.findByTestId("native-query-editor-container")
        .findByTestId("run-button")
        .should("be.visible");

      cy.findByTestId("native-query-editor-container")
        .findByLabelText("Get Answer")
        .click();
      cy.wait("@dataset");
      cy.findByTestId("visualization-root").should("contain", "42");

      cy.findByTestId("dataset-edit-bar").button("Save").click();
      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText("Name").type("m42");
        cy.button("Save").click();
      });
      cy.wait("@createModel");

      // After saving, we land on view mode for the model
      cy.location("pathname").should("match", /^\/model\/\d+-.*$/);
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing 1 row",
      );
    });

    it("lets a user without collection access save a model in their personal collection", () => {
      cy.intercept("POST", "/api/card").as("createModel");

      cy.signIn("nocollection");
      cy.visit("/browse/models");

      cy.findByLabelText("Create a new model").click();
      cy.findByTestId("new-model-options")
        .findByText("Use the notebook editor")
        .click();
      H.miniPicker().findByText("Sample Database").click();
      H.miniPicker().findByText("People").click();
      cy.findByTestId("dataset-edit-bar").button("Save").click();
      cy.findByTestId("save-question-modal")
        .should("contain", "Save model")
        .and("contain", H.getPersonalCollectionName(USERS["nocollection"]))
        .button("Save")
        .click();
      cy.wait("@createModel");
      cy.location("pathname").should("match", /^\/model\/\d+-.*$/);
    });
  });

  describe("revision history", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
      cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
        name: "Orders Model",
        type: "model",
      });
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should allow reverting to a saved question state and back into a model again", () => {
      H.visitModel(ORDERS_BY_YEAR_QUESTION_ID);

      openRevisionHistory();
      revertTo("You created this");

      H.expectUnstructuredSnowplowEvent({
        event: "revert_version_clicked",
        event_detail: "card",
      });

      cy.location("pathname").should("match", /^\/question\/\d+/);
      H.echartsContainer();
      revertTo("You edited this");

      cy.location("pathname").should("match", /^\/model\/\d+/);
      cy.get("[data-testid=cell-data]");
    });
  });
});

function getCollectionItemRow(itemName: string) {
  return cy.findByText(itemName).closest("tr");
}

function openRevisionHistory() {
  H.questionInfoButton().click();
  cy.findByTestId("saved-question-history-list")
    .scrollIntoView()
    .should("be.visible");
}

function revertTo(history: string) {
  const r = new RegExp(history);
  cy.findByText(r)
    .closest('[data-testid="revision-history-event"]')
    .findByTestId("question-revert-button")
    .click();
}

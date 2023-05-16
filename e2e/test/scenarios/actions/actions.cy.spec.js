import {
  addModelDashboard,
  dashboardHeader,
  editDashboard,
  restore,
  setActionsEnabledForDB,
  startNewNativeQuestion,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

describe("scenarios > actions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not close Action Creator modal on outside click when editing dashboard", () => {
    setActionsEnabledForDB(SAMPLE_DB_ID);
    addModelDashboard({
      name: "GUI Dashboard",
      alias: "dashboardId",
      modelDetails,
    });
    cy.get("@dashboardId").then(id => {
      cy.visit(`/dashboard/${id}`);
    });
    editDashboard();
    dashboardHeader().within(() => {
      cy.button("Add action").click();
    });
    cy.button("Pick an action").click();
    cy.get(".Modal").within(() => {
      cy.findByText("Action Library")
        .parent()
        .within(() => {
          cy.findByText("GUI Model").click();
          cy.findByText("Create new action").click();
        });
    });
    clickOutsideModal();

    cy.findByTestId("action-creator-body-container").should("exist");
  });

  it("should not close Action Creator modal on outside click when creating new action", () => {
    setActionsEnabledForDB(SAMPLE_DB_ID);
    addModelDashboard("GUI Dashboard", "dashboardId");
    cy.visit("/");
    cy.findByTestId("new-item-button").click();
    cy.findAllByTestId("action-menu-item").contains("Action").click();
    clickOutsideModal();
    cy.findByTestId("action-creator-body-container").should("exist");
  });

  it("should not close SQL Snippet editor when clicking outside modal", () => {
    setActionsEnabledForDB(SAMPLE_DB_ID);

    startNewNativeQuestion();

    cy.findByLabelText("snippet icon").click();
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Create a snippet").click();
    });

    clickOutsideModal();

    cy.get(".Modal").contains("Create your new snippet").should("exist");
  });

  it("should only close SQL Snippet editor modal when clicking `cancel` or `X` ", () => {
    setActionsEnabledForDB(SAMPLE_DB_ID);

    startNewNativeQuestion();

    cy.findByLabelText("snippet icon").click();
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Create a snippet").click();
    });

    cy.get(".Modal")
      .contains("Create your new snippet")
      .parent()
      .parent()
      .within(() => {
        cy.findByText("Cancel").click();
      });

    cy.get(".Modal").should("not.exist");
  });
});

const modelDetails = {
  name: "GUI Model",
  query: { "source-table": PRODUCTS_ID },
  dataset: true,
};

function clickOutsideModal() {
  cy.get("body").click("topLeft");
  cy.get("body").click("bottomRight");
}

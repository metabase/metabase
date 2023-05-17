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
    setActionsEnabledForDB(SAMPLE_DB_ID);
  });

  it("should not close Action Creator modal on outside click when editing dashboard", () => {
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
    addModelDashboard({
      name: "GUI Dashboard",
      alias: "dashboardId",
      modelDetails,
    });
    cy.visit("/");
    cy.findByTestId("new-item-button").click();
    cy.findAllByTestId("action-menu-item").contains("Action").click();
    clickOutsideModal();
    cy.findByTestId("action-creator-body-container").should("exist");
  });

  it("should not close SQL Snippet editor when clicking outside modal", () => {
    startNewNativeQuestion();

    cy.findByLabelText("snippet icon").click();
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Create a snippet").click();
    });

    clickOutsideModal();

    cy.get(".Modal").contains("Create your new snippet").should("exist");
  });

  it("should only close SQL Snippet editor modal when clicking `Cancel`", () => {
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

  describe("editing model actions", () => {
    it("should not close Action Editor when editing model actions", () => {
      cy.request("PUT", "/api/card/1", {
        name: "Orders Model",
        dataset: true,
      });

      cy.visit("/model/1");
      cy.findByTestId("qb-header-info-button").click();
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Model details").click();
      });
      cy.findByRole("tablist").within(() => {
        cy.findByText("Actions").click();
      });
      cy.findByTestId("model-actions-header").within(() => {
        cy.findByText("New action").click();
      });
      clickOutsideModal();
      cy.get(".Modal").should("exist");
    });

    it("should only close Action Editor when editing model actions when 'Cancel' is clicked", () => {
      cy.request("PUT", "/api/card/1", {
        name: "Orders Model",
        dataset: true,
      });

      cy.visit("/model/1");
      cy.findByTestId("qb-header-info-button").click();
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Model details").click();
      });
      cy.findByRole("tablist").within(() => {
        cy.findByText("Actions").click();
      });
      cy.findByTestId("model-actions-header").within(() => {
        cy.findByText("New action").click();
      });
      cy.findByTestId("action-creator-body-container").within(() => {
        cy.findByText("Cancel").click();
      });
      cy.get(".Modal").should("not.exist");
    });
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

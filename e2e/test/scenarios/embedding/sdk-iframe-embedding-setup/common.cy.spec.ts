import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { embedModalEnableEmbedding } from "e2e/support/helpers";

import {
  getEmbedSidebar,
  navigateToEntitySelectionStep,
  navigateToGetCodeStep,
  visitNewEmbedPage,
} from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";

describe("scenarios > embedding > sdk iframe embed setup > common", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);
    H.updateSetting("enable-embedding-static", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");

    H.mockEmbedJsToDevServer();
  });

  it("should close wizard when clicking `close` button on the modal", () => {
    navigateToEntitySelectionStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.modal()
      .first()
      .within(() => {
        cy.get("[aria-label='Close']").click();
      });

    H.modal().should("not.exist");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");
  });

  it("should close wizard when clicking `Done` button on the last step", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    H.publishChanges("dashboard");

    cy.button("Unpublish").should("be.visible");

    getEmbedSidebar().within(() => {
      cy.findByText("Done").click();
    });

    H.modal().should("not.exist");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");
  });

  it("should close wizard when navigating back in browser history", () => {
    cy.visit("/admin");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");

    cy.visit("/admin/embedding");
    cy.findAllByTestId("sdk-setting-card").should("be.visible");

    cy.findAllByTestId("sdk-setting-card")
      .first()
      .within(() => {
        cy.findByText("New embed").click();
      });

    cy.wait("@dashboard");

    H.embedModalEnableEmbedding();

    cy.get("[data-iframe-loaded]", { timeout: 20000 }).should("have.length", 1);

    H.modal().should("exist");

    cy.go("back");

    H.modal().should("not.exist");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");
  });

  describe("auth type switch", () => {
    it("should reset experience to a default only when switching from SSO to Guest auth type and the current experience does not support guest embeds", () => {
      visitNewEmbedPage();

      getEmbedSidebar().within(() => {
        cy.findByLabelText("Metabase account (SSO)").click();

        cy.findByLabelText("Browser").click();
        cy.findByLabelText("Browser").should("be.checked");

        cy.findByLabelText("Guest").click();

        cy.findByLabelText("Dashboard").should("be.checked");

        cy.findByLabelText("Chart").click();
        cy.findByLabelText("Chart").should("be.checked");

        cy.findByLabelText("Metabase account (SSO)").click();

        cy.findByLabelText("Chart").should("be.checked");

        cy.findByLabelText("Guest").click();

        cy.findByLabelText("Chart").should("be.checked");
      });
    });

    it("should not reset experience when changing auth type for Embed JS wizard opened from an entity page", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openSharingMenu("Embed");

      getEmbedSidebar().within(() => {
        embedModalEnableEmbedding();

        H.waitForSimpleEmbedIframesToLoad();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders").should("be.visible");
        });

        cy.findByLabelText("Metabase account (SSO)").click();

        H.waitForSimpleEmbedIframesToLoad();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders").should("be.visible");
        });

        cy.findByLabelText("Guest").click();

        H.waitForSimpleEmbedIframesToLoad();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders").should("be.visible");
        });
      });
    });
  });
});

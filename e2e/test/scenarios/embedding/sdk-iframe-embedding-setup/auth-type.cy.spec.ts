import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { embedModalEnableEmbedding } from "e2e/support/helpers";

import { getEmbedSidebar, visitNewEmbedPage } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > auth type", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
    H.updateSetting("enable-embedding-static", true);
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");

    H.mockEmbedJsToDevServer();
  });

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

  it("should not reset experience when changing auth type on `options` step", () => {
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

import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import {
  clickNewEmbedButton,
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
    H.activateToken("pro-self-hosted");
    H.enableTracking();
    H.updateSetting("enable-embedding-modular", true);
    H.updateSetting("show-modular-embed-terms", false);
    H.updateSetting("show-static-embed-terms", false);

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
    cy.findByTestId("embedding-hub-main")
      .findByRole("heading", { name: "Security" })
      .should("be.visible");
  });

  it("should close wizard when clicking `Done` button on the last step", () => {
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectGuest: true,
    });

    H.publishChanges("dashboard");

    cy.button("Unpublish").should("be.visible");

    getEmbedSidebar().within(() => {
      cy.findByText("Done").click();
    });

    H.modal().should("not.exist");
    cy.findByTestId("embedding-hub-main")
      .findByRole("heading", { name: "Security" })
      .should("be.visible");
  });

  it("should close wizard when navigating back in browser history", () => {
    cy.visit("/admin");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");

    cy.visit("/embedding/security");
    cy.findByTestId("embedding-hub-main")
      .findByRole("heading", { name: "Security" })
      .should("be.visible");

    clickNewEmbedButton();

    cy.wait("@dashboard");

    cy.get("[data-iframe-loaded]", { timeout: 20000 }).should("have.length", 1);

    H.modal().should("exist");

    cy.go("back");

    H.modal().should("not.exist");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");
  });

  describe("auth type switch", () => {
    it("allows to select the `guest` item even when modular embedding is disabled", () => {
      H.updateSetting("enable-embedding-modular", false);

      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

      visitNewEmbedPage({ waitForResource: false });

      cy.findByLabelText("Guest").should("be.enabled");
    });

    it("allows to select the `Metabase Account` item even when modular embedding is disabled", () => {
      H.updateSetting("enable-embedding-modular", false);

      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

      visitNewEmbedPage({ waitForResource: false });

      cy.findByLabelText("Metabase account (SSO)").should("be.enabled");
    });

    describe("default auth mode follows SSO configuration", () => {
      const openFromCommandPalette = () => {
        cy.visit("/");
        H.commandPaletteButton().click();
        H.commandPaletteInput().should("be.visible").type("new embed");
        H.commandPalette()
          .findByRole("option", { name: "New embed" })
          .should("be.visible")
          .click();
      };

      const openFromEmbeddingHub = () => {
        cy.visit("/embedding/security");
        clickNewEmbedButton();
      };

      const openFromSharingMenu = () => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        H.openSharingMenu("Embed");
      };

      const assertCheckedAuth = (mode: "sso" | "guest") => {
        const ssoLabel = "Metabase account (SSO)";
        const guestLabel = "Guest";
        getEmbedSidebar().within(() => {
          cy.findByLabelText(mode === "sso" ? ssoLabel : guestLabel).should(
            "be.checked",
          );
          cy.findByLabelText(mode === "sso" ? guestLabel : ssoLabel).should(
            "not.be.checked",
          );
        });
      };

      it("defaults to SSO from non-guest entry points when JWT SSO is configured (EMB-1783)", () => {
        enableJwtAuth();

        openFromCommandPalette();
        assertCheckedAuth("sso");

        openFromEmbeddingHub();
        assertCheckedAuth("sso");

        openFromSharingMenu();
        assertCheckedAuth("sso");
      });

      it("defaults to Guest from all entry points when SSO is not configured", () => {
        openFromCommandPalette();
        assertCheckedAuth("guest");

        openFromEmbeddingHub();
        assertCheckedAuth("guest");

        openFromSharingMenu();
        assertCheckedAuth("guest");
      });
    });

    it("should not reset experience when changing auth type for Embed JS wizard opened from an entity page", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openSharingMenu("Embed");

      getEmbedSidebar().within(() => {
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

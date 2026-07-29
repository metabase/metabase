import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

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
    H.activateToken("pro-self-hosted");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);
    H.updateSetting("show-simple-embed-terms", false);
    H.updateSetting("enable-embedding-static", true);
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
    cy.findAllByTestId("sdk-setting-card").should("be.visible");
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

    cy.get("[data-iframe-loaded]", { timeout: 20000 }).should("have.length", 1);

    H.modal().should("exist");

    cy.go("back");

    H.modal().should("not.exist");
    cy.findAllByTestId("settings-sidebar-link")
      .contains("General")
      .should("be.visible");
  });

  describe("auth type switch", () => {
    it("allows to select the `guest` item even when static embedding setting is disabled", () => {
      H.updateSetting("enable-embedding-static", false);

      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);

      visitNewEmbedPage({ waitForResource: false });

      cy.findByLabelText("Guest").should("be.enabled");
    });

    it("allows to select the `Metabase Account` item even when simple embedding setting is disabled", () => {
      H.updateSetting("enable-embedding-simple", false);

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

      const openFromAdminEmbedding = () => {
        cy.visit("/admin/embedding");
        cy.findAllByTestId("sdk-setting-card")
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });
      };

      const openFromAdminGuestEmbeds = () => {
        cy.visit("/admin/embedding/guest");
        cy.findAllByTestId("guest-embeds-setting-card")
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });
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

        openFromAdminEmbedding();
        assertCheckedAuth("sso");

        openFromSharingMenu();
        assertCheckedAuth("sso");

        // The Guest embeds admin section is intentionally guest-only and
        // forces guest mode regardless of SSO configuration.
        openFromAdminGuestEmbeds();
        assertCheckedAuth("guest");
      });

      it("defaults to Guest from all entry points when SSO is not configured", () => {
        openFromCommandPalette();
        assertCheckedAuth("guest");

        openFromAdminEmbedding();
        assertCheckedAuth("guest");

        openFromSharingMenu();
        assertCheckedAuth("guest");

        openFromAdminGuestEmbeds();
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

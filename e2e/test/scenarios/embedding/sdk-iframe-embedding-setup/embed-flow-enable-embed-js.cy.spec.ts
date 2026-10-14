import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  embedModalEnableEmbeddingCard,
  openSharingMenu,
} from "e2e/support/helpers";

import { getEmbedSidebar } from "./helpers";

const { H } = cy;

const DATA_BY_EMBEDDING_TYPE = {
  guest: {
    path: "/admin/embedding/guest",
    token: null,
    authMethodLabel: "Guest",
    cardTestId: "guest-embeds-setting-card",
    cardText:
      "To continue, enable guest embeds and agree to the usage conditions.",
    embeddingSettingName: "enable-embedding-static",
    showTermsSettingName: "show-static-embed-terms",
    tooltipText:
      /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/,
  },
  modular: {
    path: "/admin/embedding",
    token: "bleeding-edge",
    authMethodLabel: "Metabase account (SSO)",
    cardTestId: "sdk-setting-card",
    cardText:
      "To continue, enable modular embedding and agree to the usage conditions.",
    embeddingSettingName: "enable-embedding-simple",
    showTermsSettingName: "show-simple-embed-terms",
    tooltipText: /Sharing Metabase accounts is a security risk/,
  },
} as const;

describe("scenarios > embedding > sdk iframe embed setup > enable embed js (EE)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.mockEmbedJsToDevServer();
  });

  Object.entries(DATA_BY_EMBEDDING_TYPE).forEach(([key, value]) => {
    describe(key, () => {
      const {
        path,
        token,
        authMethodLabel,
        embeddingSettingName,
        showTermsSettingName,
        cardTestId,
        cardText,
        tooltipText,
      } = value;

      beforeEach(() => {
        if (token) {
          H.activateToken(token);
        }
      });

      const openNewEmbed = () => {
        cy.visit(path);

        cy.findAllByTestId(cardTestId)
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        cy.findByLabelText(authMethodLabel).click();
      };

      it("shows or hides the enable card depending on the embedding and terms settings", () => {
        cy.log("embedding is enabled and terms are not accepted");
        H.updateSetting(embeddingSettingName, true);
        H.updateSetting(showTermsSettingName, true);

        openNewEmbed();

        embedModalEnableEmbeddingCard().should(
          "contain.text",
          "Agree to the usage conditions to continue.",
        );

        embedModalEnableEmbeddingCard().should("not.contain.text", cardText);

        cy.log("shows tooltip with fair usage info");
        getEmbedSidebar().findByLabelText("info icon").trigger("mouseover");

        H.hovercard().contains(tooltipText).should("be.visible");

        cy.log("embedding is disabled");
        H.updateSetting(embeddingSettingName, false);
        H.updateSetting(showTermsSettingName, true);

        openNewEmbed();

        embedModalEnableEmbeddingCard().should("contain.text", cardText);

        cy.log("shows tooltip with fair usage info");
        embedModalEnableEmbeddingCard()
          .findByLabelText("info icon")
          .trigger("mouseover");

        H.hovercard().contains(tooltipText).should("be.visible");

        embedModalEnableEmbeddingCard()
          .findByLabelText("info icon")
          .trigger("mouseout");

        cy.findByRole("button", { name: "Agree and enable" }).should(
          "be.visible",
        );

        cy.log("preview panel should show placeholder");
        cy.get('[alt="No results"]').should("be.visible");

        cy.findByRole("button", { name: "Agree and enable" }).click();

        cy.log("button should change to Enabled state");
        cy.findByRole("button", { name: /Enabled/ })
          .should("be.visible")
          .should("be.disabled");

        // Selecting "Orders in a dashboard" explicitly on the first step
        // because sometimes it selects another one that's been used recently
        // see EMB-1106
        cy.log("Selecting an item to embed on the first step");
        cy.findByTestId("embed-browse-entity-button").click();
        H.entityPickerModal()
          .findAllByText("Orders in a dashboard")
          .first()
          .click();

        cy.log("Preview should load after embedding is enabled");
        H.waitForSimpleEmbedIframesToLoad();
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders in a dashboard", { timeout: 60_000 }).should(
            "be.visible",
          );
        });

        cy.log("embedding is enabled and terms are accepted");
        H.updateSetting(embeddingSettingName, true);
        H.updateSetting(showTermsSettingName, false);

        openNewEmbed();

        H.waitForSimpleEmbedIframesToLoad();
        getEmbedSidebar().contains(cardText).should("not.exist");
      });
    });
  });

  it("shows guest embed status bar when guest embedding is toggled from disabled to enabled state", () => {
    H.updateSetting("enable-embedding-static", false);

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    openSharingMenu("Embed");

    cy.findByRole("button", { name: "Agree and enable" }).should("be.visible");
    cy.findByTestId("embed-modal-content-status-bar").should("not.exist");

    cy.findByRole("button", { name: "Agree and enable" }).click();

    cy.findByTestId("embed-modal-content-status-bar").should("exist");
  });
});

describe("scenarios > embedding > sdk iframe embed setup > enable embed js (oss and starter)", () => {
  describe("OSS", { tags: "@OSS" }, () =>
    runOssAndStarterTests({ token: null }),
  );

  describe("Starter", () => runOssAndStarterTests({ token: "starter" }));

  function runOssAndStarterTests({ token }: { token: "starter" | null }) {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      if (token) {
        H.activateToken(token);
      }

      H.mockEmbedJsToDevServer();
    });

    const openNewGuestEmbed = () => {
      cy.visit("/admin/embedding");

      cy.findAllByTestId("guest-embeds-setting-card")
        .first()
        .within(() => {
          cy.findByText("New embed").click();
        });
    };

    describe("guest", () => {
      it("shows or hides the enable card depending on the embedding and terms settings", () => {
        cy.log("embedding is enabled and terms are not accepted");
        H.updateSetting("enable-embedding-static", true);
        H.updateSetting("show-static-embed-terms", true);

        openNewGuestEmbed();

        embedModalEnableEmbeddingCard()
          .should("contain.text", "Agree to the")
          .should("contain.text", "to continue.");

        embedModalEnableEmbeddingCard().within(() => {
          cy.findByRole("link", { name: "usage conditions" })
            .should(
              "have.attr",
              "href",
              "https://metabase.com/license/embedding",
            )
            .should("have.attr", "target", "_blank");

          cy.findByText(
            /To continue, enable guest embeds and agree to the/,
          ).should("not.exist");
        });

        cy.log("shows tooltip with fair usage info");
        getEmbedSidebar().findByLabelText("info icon").trigger("mouseover");

        H.hovercard()
          .contains(
            /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/,
          )
          .should("be.visible");

        cy.log("Metabase account (SSO) is disabled without the token feature");
        cy.findByLabelText("Metabase account (SSO)").should("be.disabled");

        cy.log("embedding is disabled");
        H.updateSetting("enable-embedding-static", false);
        H.updateSetting("show-static-embed-terms", true);

        openNewGuestEmbed();

        embedModalEnableEmbeddingCard().should(
          "contain.text",
          "To continue, enable guest embeds and agree to the usage conditions.",
        );

        embedModalEnableEmbeddingCard().within(() => {
          cy.log("usage conditions should be a link");
          cy.findByRole("link", { name: "usage conditions" })
            .should(
              "have.attr",
              "href",
              "https://metabase.com/license/embedding",
            )
            .should("have.attr", "target", "_blank");
        });

        cy.log("shows tooltip with fair usage info");
        embedModalEnableEmbeddingCard()
          .findByLabelText("info icon")
          .trigger("mouseover");

        H.hovercard()
          .contains(
            /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/,
          )
          .should("be.visible");

        embedModalEnableEmbeddingCard()
          .findByLabelText("info icon")
          .trigger("mouseout");

        cy.findByRole("button", { name: "Agree and enable" }).should(
          "be.visible",
        );

        cy.log("preview panel should show placeholder");
        cy.get('[alt="No results"]').should("be.visible");

        cy.findByRole("button", { name: "Agree and enable" }).click();

        cy.log("button should change to Enabled state");
        cy.findByRole("button", { name: /Enabled/ })
          .should("be.visible")
          .should("be.disabled");

        // Selecting "Orders in a dashboard" explicitly on the first step
        // because sometimes it selects another one that's been used recently
        // see EMB-1106
        cy.log("Selecting an item to embed on the first step");
        cy.findByTestId("embed-browse-entity-button").click();
        H.entityPickerModal()
          .findAllByText("Orders in a dashboard")
          .first()
          .click();

        cy.log("Preview should load after embedding is enabled");
        H.waitForSimpleEmbedIframesToLoad();
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders in a dashboard", { timeout: 60_000 }).should(
            "be.visible",
          );
        });

        cy.log("embedding is enabled and terms are accepted");
        H.updateSetting("enable-embedding-static", true);
        H.updateSetting("show-static-embed-terms", false);

        openNewGuestEmbed();

        cy.findByLabelText("Guest").should("be.checked");
        getEmbedSidebar()
          .contains(
            "To continue, enable guest embeds and agree to the usage conditions.",
          )
          .should("not.exist");
      });
    });
  }
});

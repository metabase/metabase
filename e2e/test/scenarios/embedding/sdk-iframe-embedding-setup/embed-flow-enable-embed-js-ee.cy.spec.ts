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
      } = value;

      beforeEach(() => {
        if (token) {
          H.activateToken(token);
        }
      });

      it("shows the Enable to Continue button and enables embedding on click", () => {
        H.updateSetting(embeddingSettingName, false);
        H.updateSetting(showTermsSettingName, true);

        cy.visit(path);

        cy.findAllByTestId(cardTestId)
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        cy.findByLabelText(authMethodLabel).click();

        embedModalEnableEmbeddingCard().within(() => {
          cy.findByText(cardText).should("exist");
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

        cy.log("Preview should load after embedding is enabled");
        H.waitForSimpleEmbedIframesToLoad();
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders in a dashboard").should("be.visible");
        });
      });

      it("shows the enable card with fair usage terms when embedding is already enabled", () => {
        H.updateSetting(embeddingSettingName, true);
        H.updateSetting(showTermsSettingName, true);

        cy.visit(path);

        cy.findAllByTestId(cardTestId)
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        cy.findByLabelText(authMethodLabel).click();

        embedModalEnableEmbeddingCard().within(() => {
          cy.findByText("Agree to the usage conditions to continue.").should(
            "exist",
          );

          cy.findByText(cardText).should("not.exist");
        });

        cy.log("shows tooltip with fair usage info");
        getEmbedSidebar().findByLabelText("info icon").trigger("mouseover");

        H.hovercard()
          .contains(
            /You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature/,
          )
          .should("be.visible");
      });

      it("hides the enable card when embedding is already enabled", () => {
        H.updateSetting(embeddingSettingName, true);
        H.updateSetting(showTermsSettingName, false);

        cy.visit(path);

        cy.findAllByTestId(cardTestId)
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        cy.findByLabelText(authMethodLabel).click();

        getEmbedSidebar().contains(cardText).should("not.exist");
      });
    });
  });

  it("shows guest embed status bar when guest embedding is toggled from disabled to enabled state", () => {
    H.updateSetting("enable-embedding-static", false);

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    openSharingMenu("Embed");

    cy.findByTestId("embed-modal-content-status-bar").should("not.exist");

    cy.findByRole("button", { name: "Agree and enable" }).click();

    cy.findByTestId("embed-modal-content-status-bar").should("exist");
  });
});

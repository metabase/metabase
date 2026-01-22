import { embedModalEnableEmbeddingCard } from "e2e/support/helpers";

import { getEmbedSidebar } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > enable embed js (oss and starter)", () => {
  describe("OSS", { tags: "@OSS" }, () => runTests({ token: null }));

  describe("Starter", () => runTests({ token: "starter" }));

  function runTests({ token }: { token: "starter" | null }) {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      if (token) {
        H.activateToken(token);
      }

      H.mockEmbedJsToDevServer();
    });

    describe("guest", () => {
      it("shows the Enable to Continue button and enables embedding on click", () => {
        H.updateSetting("enable-embedding-static", false);
        H.updateSetting("show-static-embed-terms", true);

        cy.visit("/admin/embedding");

        cy.findAllByTestId("guest-embeds-setting-card")
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        embedModalEnableEmbeddingCard().within(() => {
          cy.findByText(
            "To continue, enable guest embeds and agree to the usage conditions.",
          ).should("exist");
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

        // Going to the next step and selecting "Orders in a dashboard" explicitely
        // because sometimes it selects another one that's been used recently
        // see EMB-1106
        cy.log(
          "Navigating to embed flow step 2 and selecting an item to embed",
        );
        cy.findByRole("button", { name: "Next" }).click();
        cy.get('[data-testid="embed-recent-item-card"]')
          .should("have.length.greaterThan", 0)
          .contains("Orders in a dashboard")
          .click();

        cy.log("Preview should load after embedding is enabled");
        H.waitForSimpleEmbedIframesToLoad();
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Orders in a dashboard", { timeout: 60_000 }).should(
            "be.visible",
          );
        });
      });

      it("shows the enable card with fair usage terms when embedding is already enabled", () => {
        H.updateSetting("enable-embedding-static", true);
        H.updateSetting("show-static-embed-terms", true);

        cy.visit("/admin/embedding");

        cy.findAllByTestId("guest-embeds-setting-card")
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        embedModalEnableEmbeddingCard().within(() => {
          cy.findByText("Agree to the usage conditions to continue.").should(
            "exist",
          );

          cy.findByText(
            "To continue, enable guest embeds and agree to the usage conditions.",
          ).should("not.exist");
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
        H.updateSetting("enable-embedding-static", true);
        H.updateSetting("show-static-embed-terms", false);

        cy.visit("/admin/embedding");

        cy.findAllByTestId("guest-embeds-setting-card")
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        getEmbedSidebar()
          .contains(
            "To continue, enable guest embeds and agree to the usage conditions.",
          )
          .should("not.exist");
      });
    });

    describe("Metabase account (sso)", () => {
      it("does not show the Enable to Continue button and disables item", () => {
        H.updateSetting("enable-embedding-simple", false);
        H.updateSetting("show-simple-embed-terms", true);

        cy.visit("/admin/embedding");

        cy.findAllByTestId("guest-embeds-setting-card")
          .first()
          .within(() => {
            cy.findByText("New embed").click();
          });

        embedModalEnableEmbeddingCard().within(() => {
          cy.findByText(
            "To continue, enable guest embeds and agree to the usage conditions.",
          ).should("not.exist");
        });

        cy.findByLabelText("Metabase account (SSO)").should("be.disabled");
      });
    });
  }
});

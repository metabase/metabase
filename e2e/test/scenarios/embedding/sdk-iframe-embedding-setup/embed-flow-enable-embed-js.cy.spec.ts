import { embedModalEnableEmbeddingCard } from "e2e/support/helpers";

import { getEmbedSidebar } from "./helpers";

const { H } = cy;

const { IS_ENTERPRISE } = Cypress.env();
const IS_OSS = !IS_ENTERPRISE;
const MB_EDITION = IS_ENTERPRISE ? "ee" : "oss";

const DATA_BY_MB_EDITION = {
  oss: {
    cardTestId: "guest-embeds-setting-card",
    cardText:
      "To continue, enable guest embeds and agree to the usage conditions.",
    embeddingSettingName: "enable-embedding-static",
    showTermsSettingName: "show-static-embed-terms",
  },
  ee: {
    cardTestId: "sdk-setting-card",
    cardText:
      "To continue, enable modular embedding and agree to the usage conditions.",
    embeddingSettingName: "enable-embedding-simple",
    showTermsSettingName: "show-simple-embed-terms",
  },
} as const;

describe(
  `scenarios > embedding > sdk iframe embed setup > enable embed js > ${MB_EDITION}`,
  { ...(IS_OSS && { tags: "@OSS" }) },
  () => {
    const { embeddingSettingName, showTermsSettingName, cardTestId, cardText } =
      DATA_BY_MB_EDITION[MB_EDITION];

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      if (IS_ENTERPRISE) {
        H.activateToken("bleeding-edge");
      }

      H.mockEmbedJsToDevServer();
    });

    it("shows the Enable to Continue button and enables embedding on click", () => {
      H.updateSetting(embeddingSettingName, false);
      H.updateSetting(showTermsSettingName, true);

      cy.visit("/admin/embedding");

      cy.findAllByTestId(cardTestId)
        .first()
        .within(() => {
          cy.findByText("New embed").click();
        });

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

      // Going to the next step and selecting "Orders in a dashboard" explicitely
      // because sometimes it selects another one that's been used recently
      // see EMB-1106
      cy.log("Navigating to embed flow step 2 and selecting an item to embed");
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
      H.updateSetting(embeddingSettingName, true);
      H.updateSetting(showTermsSettingName, true);

      cy.visit("/admin/embedding");

      cy.findAllByTestId(cardTestId)
        .first()
        .within(() => {
          cy.findByText("New embed").click();
        });

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

      cy.visit("/admin/embedding");

      cy.findAllByTestId(cardTestId)
        .first()
        .within(() => {
          cy.findByText("New embed").click();
        });

      getEmbedSidebar().contains(cardText).should("not.exist");
    });
  },
);

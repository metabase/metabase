import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { getEmbedSidebar } from "../embedding/sdk-iframe-embedding-setup/helpers";

const { H } = cy;

const suiteTitle = "scenarios > sharing > embed flow pre-selection";

// The Behavior/Parameters/Appearance cards share a wrapper whose inline
// `opacity` style is dimmed (0.5) while the selected auth type isn't ready.
const optionCardsWrapper = () =>
  getEmbedSidebar().findByText("Behavior").closest("[style*='opacity']");

describe(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("pre-selects dashboard in embed flow when opened from dashboard sharing modal", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openSharingMenu("Embed");
    H.embedModalEnableEmbedding();

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    getEmbedSidebar().within(() => {
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard", { timeout: 10_000 })
      .should("be.visible");

    getEmbedSidebar().findByText("Back").should("not.exist");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  it("lets Guest embedding proceed after accepting only the Guest terms, without requiring the SSO terms (EMB-1884)", () => {
    // Reproduce a fresh Pro instance where neither auth type's terms have
    // been accepted yet, so the option cards start dimmed.
    H.updateSetting("show-simple-embed-terms", true);
    H.updateSetting("show-static-embed-terms", true);
    H.updateSetting("enable-embedding-static", false);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openSharingMenu("Embed");

    cy.log("switch to Guest authentication");
    getEmbedSidebar().findByLabelText("Guest").click();

    cy.log("option cards stay dimmed until the Guest terms are accepted");
    optionCardsWrapper().should("have.css", "opacity", "0.5");

    cy.log("accept the Guest terms only — never the SSO terms");
    H.embedModalEnableEmbedding();

    cy.log("option cards become available without accepting the SSO terms");
    optionCardsWrapper().should("have.css", "opacity", "1");
  });

  it("pre-selects question in embed flow when opened from question sharing modal", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openSharingMenu("Embed");
    H.embedModalEnableEmbedding();

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    getEmbedSidebar().within(() => {
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders", { timeout: 10_000 })
      .should("be.visible");

    getEmbedSidebar().findByText("Back").should("not.exist");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });
});

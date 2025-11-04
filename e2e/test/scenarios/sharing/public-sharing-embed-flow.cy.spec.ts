import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { getEmbedSidebar } from "../embedding/sdk-iframe-embedding-setup/helpers";

const { H } = cy;

const suiteTitle = "scenarios > sharing > embed flow pre-selection";

H.describeWithSnowplow(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
    H.updateSetting("enable-embedding-simple", true);
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("pre-selects dashboard in embed flow when opened from dashboard sharing modal", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openSharingMenu("Embed");

    H.getEmbedModalSharingPane().within(() => {
      cy.findByRole("button", { name: "Embedded Analytics JS" }).click();
    });

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    getEmbedSidebar().within(() => {
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard", { timeout: 10_000 })
      .should("be.visible");

    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  it("pre-selects question in embed flow when opened from question sharing modal", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openSharingMenu("Embed");

    H.getEmbedModalSharingPane()
      .findByRole("button", { name: "Embedded Analytics JS" })
      .click();

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    getEmbedSidebar().within(() => {
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders", { timeout: 10_000 })
      .should("be.visible");

    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  it("tracks default resources for pre-selected dashboard", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openSharingMenu("Embed");

    H.getEmbedModalSharingPane().within(() => {
      cy.findByRole("button", { name: "Embedded Analytics JS" }).click();
    });

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    cy.log("go back to resource selection step");
    getEmbedSidebar().within(() => {
      cy.findByText("Back").click();
      cy.findByText("Select a dashboard to embed").should("be.visible");
      cy.findByText("Next").click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_resource_selection_completed",
      event_detail: "default",
    });
  });

  it("tracks default resources for pre-selected question", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openSharingMenu("Embed");

    H.getEmbedModalSharingPane().within(() => {
      cy.findByRole("button", { name: "Embedded Analytics JS" }).click();
    });

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    cy.log("go back to resource selection step");
    getEmbedSidebar().within(() => {
      cy.findByText("Back").click();
      cy.findByText("Select a chart to embed").should("be.visible");
      cy.findByText("Next").click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_resource_selection_completed",
      event_detail: "default",
    });
  });
});

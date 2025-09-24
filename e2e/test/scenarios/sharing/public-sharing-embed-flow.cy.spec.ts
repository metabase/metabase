import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import { getEmbedSidebar } from "../embedding/sdk-iframe-embedding-setup/helpers";

const { H } = cy;

describe("embed flow pre-selection from sharing modal", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("enable-embedding-simple", true);
  });

  it("pre-selects dashboard in embed flow when opened from dashboard sharing modal", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openSharingMenu("Embed");

    H.getEmbedModalSharingPane().within(() => {
      cy.findByRole("link", { name: "Embedded Analytics JS" }).click();
    });

    cy.location("search").should((search) => {
      const params = new URLSearchParams(search);

      expect(params.get("resource_type")).to.equal("dashboard");
      expect(params.get("resource_id")).to.equal(String(ORDERS_DASHBOARD_ID));
    });

    cy.findByRole("radio", { name: /Dashboard/ }).should("be.checked");
    cy.findByRole("button", { name: "Next" }).click();

    getEmbedSidebar().within(() => {
      cy.findByText("Select a dashboard to embed").should("be.visible");
      cy.findByText("Orders in a dashboard").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard", { timeout: 10_000 })
      .should("be.visible");
  });

  it("pre-selects question in embed flow when opened from question sharing modal", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.openSharingMenu("Embed");

    H.getEmbedModalSharingPane().within(() => {
      cy.findByRole("link", { name: "Embedded Analytics JS" }).click();
    });

    cy.location("search").should((search) => {
      const params = new URLSearchParams(search);

      expect(params.get("resource_type")).to.equal("question");
      expect(params.get("resource_id")).to.equal(String(ORDERS_QUESTION_ID));
    });

    cy.findByRole("radio", { name: /Chart/ }).should("be.checked");
    cy.findByRole("button", { name: "Next" }).click();

    getEmbedSidebar().within(() => {
      cy.findByText("Select a chart to embed").should("be.visible");
      cy.findByText("Orders").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders", { timeout: 10_000 })
      .should("be.visible");
  });
});

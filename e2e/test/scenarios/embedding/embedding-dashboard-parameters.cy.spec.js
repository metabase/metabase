const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  dashboardDetails,
  mapParameters,
  questionDetails,
} from "./shared/embedding-dashboard";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > embedding > dashboard parameters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.request("POST", `/api/field/${ORDERS.USER_ID}/dimension`, {
      type: "external",
      name: "User ID",
      human_readable_field_id: PEOPLE.NAME,
    });

    [ORDERS.USER_ID, PEOPLE.NAME, PEOPLE.ID].forEach((id) =>
      cy.request("PUT", `/api/field/${id}`, { has_field_values: "search" }),
    );

    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      mapParameters({ id, card_id, dashboard_id });
    });
  });

  it("should allow searching dashboard parameters in preview embed modal", () => {
    H.visitDashboard("@dashboardId");

    cy.intercept(
      "GET",
      "api/preview_embed/dashboard/*",
      cy.spy().as("previewEmbedSpy"),
    ).as("previewEmbed");

    H.openStaticEmbeddingModal({
      activeTab: "parameters",
      acceptTerms: false,
      previewMode: "preview",
    });

    cy.wait("@previewEmbed", { timeout: 20000 });

    cy.findByLabelText("Configuring parameters").as("allParameters");

    cy.get("@allParameters").within(() => {
      // select the dropdown next to the Name parameter so that we can set it to editable
      cy.findByText("Name")
        .parent()
        .within(() => {
          cy.findByText("Disabled").click();
        });
    });

    H.popover().findByText("Editable").click();
    cy.wait("@previewEmbed", { timeout: 20000 });

    cy.get("iframe", { timeout: 30000 }).should("be.visible");

    // Wait specifically for the Name parameter to be visible and editable in the iframe
    H.getIframeBody().within(() => {
      cy.findByTestId("dashboard-parameters-widget-container", {
        timeout: 30000, // Longer timeout for throttled network
      })
        .should("be.visible")
        .findByText("Name")
        .should("be.visible");
    });

    cy.get("@previewEmbedSpy").should("have.callCount", 2);
    H.getIframeBody().findByText("Test Dashboard").should("exist");

    // Use the helper function which has built-in iframe loading logic
    H.getIframeBody().within(() => {
      // Wait for dashboard parameters to be available before interacting
      cy.findByTestId("dashboard-parameters-widget-container", {
        timeout: 20000,
      }).should("be.visible");

      // Open the Name filter dropdown
      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("Name")
        .click();

      // Test searching for names containing specific text
      cy.findByPlaceholderText("Search by Name").type("Af");

      // Verify that search results are filtered
      H.popover().within(() => {
        // Should show names containing "Af"
        cy.findByText("Afton Lesch").should("be.visible");
        // Should not show names that don't match the search
        cy.findByText("Lina Heaney").should("not.exist");
      });
    });
  });
});

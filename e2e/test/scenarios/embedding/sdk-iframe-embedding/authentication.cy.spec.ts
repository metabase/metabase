import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > authentication", () => {
  it("authenticates and loads dashboard via JWT SSO", () => {
    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["jwt"],
    });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    cy.wait("@getDashCardQuery");
    frame.within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      H.assertTableRowsCount(2000);
    });
  });

  it("shows an error if we are using an API key in production", () => {
    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["api-key"],
    });
    cy.signOut();

    cy.log("restore the current page's domain");
    cy.visit("http://localhost:4000");

    cy.log("visit a test page with an origin of example.com using api keys");
    cy.get("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        origin: "http://example.com",
        template: "exploration",
        apiKey,
      });

      frame
        .findByText("Using an API key in production is not allowed.")
        .should("exist");
    });
  });

  it("does not show an error if we are using an API key in development", () => {
    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["api-key"],
    });
    cy.signOut();

    cy.get("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        template: "exploration",
        apiKey,
      });

      frame
        .findByText("Using an API key in production is not allowed.")
        .should("not.exist");
    });
  });
});

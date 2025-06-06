import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  mockAuthSsoEndpointForSamlAuthProvider,
  stubWindowOpenForSamlPopup,
} from "e2e/support/helpers/embedding-sdk-testing";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > authentication", () => {
  it("cannot login if no auth methods are enabled", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [] });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "Backend returned an error when refreshing the token.");
    });
  });

  it("can login via JWT", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt"] });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
    });

    assertDashboardLoaded(frame);
  });

  it("can login via SAML", () => {
    mockAuthSsoEndpointForSamlAuthProvider();
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [] });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      onVisitPage: () => stubWindowOpenForSamlPopup(),
    });

    assertDashboardLoaded(frame);
  });

  it("shows an error if the SAML login results in an invalid user", () => {
    mockAuthSsoEndpointForSamlAuthProvider();
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [] });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      onVisitPage: () => stubWindowOpenForSamlPopup({ isUserValid: false }),
    });

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and(
          "contain",
          "Failed to fetch the user, the session might be invalid.",
        );
    });
  });

  it("shows an error if we are using an API key in production", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["api-key"] });
    cy.signOut();

    cy.log("restore the current page's domain");
    cy.visit("http://localhost:4000");

    cy.log("visit a test page with an origin of example.com using api keys");
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        origin: "http://example.com",
        dashboardId: ORDERS_DASHBOARD_ID,
        apiKey,
      });

      frame
        .findByText("Using an API key in production is not allowed.")
        .should("exist");

      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });

  it("does not show an error if we are using an API key in development", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["api-key"] });
    cy.signOut();

    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        dashboardId: ORDERS_DASHBOARD_ID,
        apiKey,
      });

      assertDashboardLoaded(frame);

      frame
        .findByText("Using an API key in production is not allowed.")
        .should("not.exist");
    });
  });

  it("uses JWT when authMethod is set to 'jwt' and both SAML and JWT are enabled", () => {
    cy.intercept("GET", "/auth/sso?preferred_method=jwt").as("authSso");

    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt", "saml"] });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      preferredAuthMethod: "jwt",
    });

    cy.wait("@authSso").its("response.body.method").should("eq", "jwt");
    assertDashboardLoaded(frame);
  });

  it("uses SAML when authMethod is set to 'saml' and both SAML and JWT are enabled", () => {
    cy.intercept("GET", "/auth/sso?preferred_method=saml").as("authSso");

    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt", "saml"] });
    cy.signOut();

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      preferredAuthMethod: "saml",
    });

    cy.log("must fail to login via SAML as the SAML endpoint does not exist");
    cy.wait("@authSso").its("response.statusCode").should("eq", 500);
    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "Backend returned an error when refreshing the token.");
    });
  });
});

function assertDashboardLoaded(frame: Cypress.Chainable) {
  cy.wait("@getDashCardQuery");
  frame.within(() => {
    cy.findByText("Orders in a dashboard").should("be.visible");
    cy.findByText("Orders").should("be.visible");
    H.assertTableRowsCount(2000);
  });
}

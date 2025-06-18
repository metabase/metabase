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

  it("can use existing user session when useExistingUserSession is true", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [] });

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      useExistingUserSession: true,
    });

    assertDashboardLoaded(frame);
  });

  it("cannot use existing user session when useExistingUserSession is false", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [] });

    const frame = H.loadSdkIframeEmbedTestPage({
      dashboardId: ORDERS_DASHBOARD_ID,
      useExistingUserSession: false,
    });

    cy.log(
      "when no auth methods are enabled and the existing user session is not used, it should fail to login",
    );

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "Backend returned an error when refreshing the token");
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

  it("shows an error if we are using the existing user session in production", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [] });
    cy.signOut();

    cy.log("restore the current page's domain");
    cy.visit("http://localhost:4000");

    cy.log(
      "visit a test page with an origin of example.com using the existing user session",
    );
    const frame = H.loadSdkIframeEmbedTestPage({
      origin: "http://example.com",
      dashboardId: ORDERS_DASHBOARD_ID,
      useExistingUserSession: true,
    });

    frame
      .findByText(
        "Using the existing user's session in production is not allowed.",
      )
      .should("exist");

    frame.findByText("Orders in a dashboard").should("not.exist");
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

import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  getSignedJwtForUser,
  mockAuthSsoEndpointForSamlAuthProvider,
  stubWindowOpenForSamlPopup,
} from "e2e/support/helpers/embedding-sdk-testing";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > authentication", () => {
  it("cannot login if no auth methods are enabled", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
    });

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "SSO has not been enabled and/or configured");
    });
  });

  it("can use existing user session when useExistingUserSession is true", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: false });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        useExistingUserSession: true,
      },
    });

    assertDashboardLoaded(frame);
  });

  it("cannot use existing user session when there is no session", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: { dashboardId: ORDERS_DASHBOARD_ID },
        },
      ],

      metabaseConfig: { useExistingUserSession: true },
    });

    frame.within(() => {
      cy.findByTestId("sdk-error-container", { timeout: 10_000 }).should(
        "contain",
        /Failed to authenticate using an existing Metabase user session./,
      );

      cy.findByRole("link", { name: "Read more." })
        .should("have.attr", "href")
        .and(
          "include",
          "https://www.metabase.com/docs/latest/embedding/embedded-analytics-js#use-existing-user-session-to-test-embeds",
        );

      cy.findByTestId("sdk-error-container").should("be.visible");
    });
  });

  it("cannot use existing user session when useExistingUserSession is false", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: false });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        useExistingUserSession: false,
      },
    });

    cy.log(
      "when no auth methods are enabled and the existing user session is not used, it should fail to login",
    );

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "SSO has not been enabled and/or configured");
    });
  });

  it("can login via JWT", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt"], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
    });

    assertDashboardLoaded(frame);
  });

  it("can login via JWT and a custom fetch request token function", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt"], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      onVisitPage: (win) => {
        (win as any).metabaseConfig = {
          ...(win as any).metabaseConfig,
          fetchRequestToken: async () => {
            const jwt = await getSignedJwtForUser({ user: USERS.admin });

            return { jwt };
          },
        };
      },
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
    });

    assertDashboardLoaded(frame);
  });

  it("shows error message if login via JWT and a custom fetch request token is failing", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt"], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      onVisitPage: (win) => {
        (win as any).metabaseConfig = {
          ...(win as any).metabaseConfig,
          fetchRequestToken: async () => {
            return { jwt: "" };
          },
        };
      },
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
    });

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .findByText(/Failed to fetch JWT token/)
        .should("exist");
    });
  });

  it("can login via SAML", () => {
    mockAuthSsoEndpointForSamlAuthProvider();
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      onVisitPage: () => stubWindowOpenForSamlPopup(),
    });

    assertDashboardLoaded(frame);
  });

  it("shows an error if the SAML login results in an invalid user", () => {
    mockAuthSsoEndpointForSamlAuthProvider();
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
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
    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["api-key"],
      signOut: true,
    });

    cy.log("restore the current page's domain");
    cy.visit("http://localhost:4000");

    cy.log("visit a test page with an origin of example.com using api keys");
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
            },
          },
        ],
        origin: "http://example.com",
        metabaseConfig: {
          apiKey,
        },
      });

      frame
        .findByText("Using an API key in production is not allowed.")
        .should("exist");

      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });

  it("shows an error if we are using the existing user session in production", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    cy.log("restore the current page's domain");
    cy.visit("http://localhost:4000");

    cy.log(
      "visit a test page with an origin of example.com using the existing user session",
    );
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      origin: "http://example.com",
      metabaseConfig: {
        useExistingUserSession: true,
      },
    });

    frame
      .findByText(
        "Using the existing user's session in production is not allowed.",
      )
      .should("exist");

    frame.findByText("Orders in a dashboard").should("not.exist");
  });

  it("does not show an error if we are using an API key in development", () => {
    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["api-key"],
      signOut: true,
    });

    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
            },
          },
        ],
        metabaseConfig: {
          apiKey,
        },
      });

      assertDashboardLoaded(frame);

      frame
        .findByText("Using an API key in production is not allowed.")
        .should("not.exist");
    });
  });

  it("uses JWT when authMethod is set to 'jwt' and both SAML and JWT are enabled", () => {
    cy.intercept("GET", "/auth/sso?preferred_method=jwt").as("authSso");

    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["jwt", "saml"],
      signOut: true,
    });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        preferredAuthMethod: "jwt",
      },
    });

    cy.wait("@authSso").its("response.body.method").should("eq", "jwt");
    assertDashboardLoaded(frame);
  });

  it("uses SAML when authMethod is set to 'saml' and both SAML and JWT are enabled", () => {
    cy.intercept("GET", "/auth/sso?preferred_method=saml").as("authSso");

    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["jwt", "saml"],
      signOut: true,
    });

    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        preferredAuthMethod: "saml",
      },
    });

    cy.log("must fail to login via SAML as the SAML endpoint does not exist");

    // If the error message returns a 500 (internal server error) status code,
    // we should show a generic error message.
    // This happens because the SAML endpoint is not mocked in this test.
    cy.wait("@authSso").its("response.statusCode").should("eq", 500);

    frame.within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and(
          "contain",
          "Unable to connect to instance at http://localhost:4000 (status: 500)",
        );
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

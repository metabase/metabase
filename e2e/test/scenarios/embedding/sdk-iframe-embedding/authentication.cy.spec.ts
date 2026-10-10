import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  getSignedJwtForUser,
  mockAuthSsoEndpointForSamlAuthProvider,
  stubWindowOpenForSamlPopup,
} from "e2e/support/helpers/embedding-sdk-testing";

const { H } = cy;

const ORDERS_DASHBOARD_ELEMENT = {
  component: "metabase-dashboard",
  attributes: { dashboardId: ORDERS_DASHBOARD_ID },
} as const;

describe("scenarios > embedding > sdk iframe embedding > authentication", () => {
  describe("jwtProviderUri", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.prepareSdkIframeEmbedTest({
        withToken: "bleeding-edge",
      });

      cy.intercept("GET", "http://localhost:4000/auth/sso").as("sso");
      cy.intercept("GET", "http://auth-provider/sso?response=json").as(
        "ssoProvider",
      );
      cy.intercept("POST", "http://localhost:4000/auth/sso").as(
        "tokenInSessionOut",
      );
    });

    it("skips the first auth request only if jwtProviderUri is given", () => {
      cy.log("jwtProviderUri is given");
      H.visitCustomHtmlPage(`
        <!DOCTYPE html>
          <html>
          <body>
            <script src="http://localhost:4000/app/embed.js" ></script>
            <script>
              function defineMetabaseConfig(settings) {
                window.metabaseConfig = settings;
              }
            </script>
            <script>
              defineMetabaseConfig({
                "instanceUrl": "http://localhost:4000",
                "jwtProviderUri": "http://auth-provider/sso?response=json",
              });
            </script>
            <metabase-dashboard dashboard-id='${ORDERS_DASHBOARD_ID}' />
          </body>
          </html>
            `);

      cy.wait("@ssoProvider");
      cy.wait("@tokenInSessionOut");

      cy.get("@sso.all").should("have.length", 0);

      cy.wait("@getDashboard");

      H.getSimpleEmbedIframeContent().should(
        "contain",
        "Orders in a dashboard",
      );

      cy.log("jwtProviderUri is not given");
      H.visitCustomHtmlPage(`
        <!DOCTYPE html>
          <html>
          <body>
            <script src="http://localhost:4000/app/embed.js" ></script>
            <script>
              function defineMetabaseConfig(settings) {
                window.metabaseConfig = settings;
              }
            </script>
            <script>
              defineMetabaseConfig({
                "instanceUrl": "http://localhost:4000",
              });
            </script>
            <metabase-dashboard dashboard-id='${ORDERS_DASHBOARD_ID}' />
          </body>
          </html>
            `);

      cy.wait("@sso");
      cy.wait("@ssoProvider");
      cy.wait("@tokenInSessionOut");

      cy.wait("@getDashboard");

      H.getSimpleEmbedIframeContent().should(
        "contain",
        "Orders in a dashboard",
      );
    });
  });

  it("shows auth errors when no auth methods are enabled and there is no session", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    cy.log("no auth method is available");
    H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
    }).within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "SSO has not been enabled and/or configured");
    });

    cy.log("useExistingUserSession is true but there is no session");
    H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      metabaseConfig: { useExistingUserSession: true },
    }).within(() => {
      cy.findByTestId("sdk-error-container")
        .findByText(
          "Failed to authenticate using an existing Metabase user session.",
        )
        .should("be.visible");

      cy.findByRole("link", { name: "Read more." })
        .should("have.attr", "href")
        .and(
          "include",
          "https://www.metabase.com/docs/latest/embedding/authentication#configure-session-cookies-when-testing-locally",
        );
    });

    cy.log("restore the current page's domain");
    cy.visit("http://localhost:4000");

    cy.log(
      "visit a test page with an origin of example.com using the existing user session",
    );
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
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

  it("uses the existing user session only when useExistingUserSession is true", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: false });

    cy.log(
      "when no auth methods are enabled and the existing user session is not used, it should fail to login",
    );
    H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      metabaseConfig: {
        useExistingUserSession: false,
      },
    }).within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and("contain", "SSO has not been enabled and/or configured");
    });

    cy.log("useExistingUserSession is true");
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      metabaseConfig: {
        useExistingUserSession: true,
      },
    });

    assertDashboardLoaded(frame);
  });

  it("can login via JWT with a custom fetch request token function, and shows an error if it fails", () => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["jwt"], signOut: true });

    cy.log("fetchRequestToken returns an empty token");
    H.loadSdkIframeEmbedTestPage({
      onVisitPage: (win) => {
        // Unjustified type cast. FIXME
        (win as any).metabaseConfig = {
          // Unjustified type cast. FIXME
          ...(win as any).metabaseConfig,
          fetchRequestToken: async () => {
            return { jwt: "" };
          },
        };
      },
      elements: [ORDERS_DASHBOARD_ELEMENT],
    }).within(() => {
      cy.findByTestId("sdk-error-container")
        .findByText(/Failed to fetch JWT token/)
        .should("exist");
    });

    cy.log("fetchRequestToken returns a valid token");
    const frame = H.loadSdkIframeEmbedTestPage({
      onVisitPage: (win) => {
        // Unjustified type cast. FIXME
        (win as any).metabaseConfig = {
          // Unjustified type cast. FIXME
          ...(win as any).metabaseConfig,
          fetchRequestToken: async () => {
            const jwt = await getSignedJwtForUser({ user: USERS.admin });

            return { jwt };
          },
        };
      },
      elements: [ORDERS_DASHBOARD_ELEMENT],
    });

    assertDashboardLoaded(frame);
  });

  it("can login via SAML, and shows an error if the SAML login results in an invalid user", () => {
    mockAuthSsoEndpointForSamlAuthProvider();
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: [], signOut: true });

    cy.log("SAML login results in an invalid user");
    H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      onVisitPage: () => stubWindowOpenForSamlPopup({ isUserValid: false }),
    }).within(() => {
      cy.findByTestId("sdk-error-container")
        .should("be.visible")
        .and(
          "contain",
          "Failed to fetch the user, the session might be invalid.",
        );
    });

    cy.log("SAML login results in a valid user");
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      onVisitPage: () => stubWindowOpenForSamlPopup(),
    });

    assertDashboardLoaded(frame);
  });

  it("allows an API key in development but not in production", () => {
    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["api-key"],
      signOut: true,
    });

    cy.get<string>("@apiKey").then((apiKey) => {
      cy.log("development");
      const developmentFrame = H.loadSdkIframeEmbedTestPage({
        elements: [ORDERS_DASHBOARD_ELEMENT],
        metabaseConfig: {
          apiKey,
        },
      });

      assertDashboardLoaded(developmentFrame);

      developmentFrame
        .findByText("Using an API key in production is not allowed.")
        .should("not.exist");

      cy.log("restore the current page's domain");
      cy.visit("http://localhost:4000");

      cy.log("visit a test page with an origin of example.com using api keys");
      const productionFrame = H.loadSdkIframeEmbedTestPage({
        elements: [ORDERS_DASHBOARD_ELEMENT],
        origin: "http://example.com",
        metabaseConfig: {
          apiKey,
        },
      });

      productionFrame
        .findByText("Using an API key in production is not allowed.")
        .should("exist");

      productionFrame.findByText("Orders in a dashboard").should("not.exist");
    });
  });

  it("uses the auth method set in preferredAuthMethod when both SAML and JWT are enabled", () => {
    cy.intercept("GET", "/auth/sso?preferred_method=saml").as("samlAuthSso");
    cy.intercept("GET", "/auth/sso?preferred_method=jwt").as("jwtAuthSso");

    H.prepareSdkIframeEmbedTest({
      enabledAuthMethods: ["jwt", "saml"],
      signOut: true,
    });

    cy.log("preferredAuthMethod is saml");
    H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      metabaseConfig: {
        preferredAuthMethod: "saml",
      },
      // Once SAML is chosen, the SDK opens the IdP AuthnRequest URL in a popup.
      // The IdP isn't real here and we don't simulate the callback, so stub
      // window.open to keep it from actually navigating — we only care that SAML
      // (not JWT) was selected.
      onVisitPage: () =>
        cy.window().then((win) => {
          cy.stub(win, "open").returns({ closed: false, close: () => {} });
        }),
    });

    // preferredAuthMethod: "saml" must route to the SAML initiate endpoint. It now
    // returns a 200 with the AuthnRequest redirect (the RelayState is stored
    // server-side and only a short key is sent to the IdP).
    cy.wait("@samlAuthSso").then(({ response }) => {
      expect(response?.statusCode).to.eq(200);
      expect(response?.body?.method).to.eq("saml");
    });

    cy.log("preferredAuthMethod is jwt");
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [ORDERS_DASHBOARD_ELEMENT],
      metabaseConfig: {
        preferredAuthMethod: "jwt",
      },
    });

    cy.wait("@jwtAuthSso").its("response.body.method").should("eq", "jwt");
    assertDashboardLoaded(frame);
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

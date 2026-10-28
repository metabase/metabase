import type { EmbeddedDataApp } from "e2e/support/helpers";
import {
  getSignedJwtForUser,
  mockAuthProviderAndJwtSignIn,
} from "e2e/support/helpers/embedding-sdk-testing";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

const { H } = cy;

const APP_FRAME = 'iframe[title="Data app"]';

describe("scenarios > embedding > data app web component (DAT-14)", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.createEmbeddedDataApp().as("app");

    cy.intercept("POST", "/auth/sso").as("ssoSession");
    cy.intercept("POST", "/api/dataset").as("ordersQuery");
    cy.intercept("GET", "/api/ee/apps/embedded-app/bundle").as("appBundle");
    cy.intercept("GET", "/embed/embedded-apps/embedded-app/**").as(
      "appDocument",
    );
  });

  it("renders a real query and keeps nested navigation inside the app", () => {
    loadApp("/orders?view=recent");

    appBody()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    cy.location("href").as("hostUrl");
    cy.get<HTMLIFrameElement>(APP_FRAME)
      .its("0.contentWindow.location.search")
      .should("include", "view=recent");

    appBody().findByTestId("current-pathname").should("have.text", "/orders");
    appBody().findByRole("button", { name: "Order details" }).click();

    appBody()
      .findByTestId("current-pathname")
      .should("have.text", "/orders/details");

    cy.get<HTMLIFrameElement>(APP_FRAME)
      .its("0.contentWindow.location.search")
      .should("include", "tab=summary");

    cy.get<string>("@hostUrl").then((url) =>
      cy.location("href").should("eq", url),
    );

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession").then(
      ({ response }) => {
        expect(response?.statusCode).to.eq(200);

        cy.wait("@ordersQuery")
          .its("request.headers.x-metabase-session")
          .should("eq", response?.body.id);
      },
    );

    cy.wait("@appBundle")
      .its("response.headers.x-metabase-data-app-content-security-policy")
      .should("be.a", "string");

    cy.get("@ssoSession.all").should("have.length", 1);
  });

  it("refreshes an expired session without reloading the app", () => {
    cy.then(() => getSignedJwtForUser({ expiredInSeconds: 60 })).then((jwt) =>
      mockAuthProviderAndJwtSignIn(undefined, { jwt }),
    );

    loadApp("/orders/details?tab=summary");

    appBody()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");
    appBody().findByRole("textbox", { name: "Notes" }).type("Keep this draft");
    cy.wait("@ordersQuery");

    // Only Date.now changes: timers and the backend's real sessions keep running.
    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession").then(
      ({ response }) => {
        expect(response?.body.exp).to.be.a("number");
        const expiredNow = (Number(response?.body.exp) + 5) * 1000;

        cy.get<HTMLIFrameElement>(APP_FRAME)
          .its("0.contentWindow")
          .then((win: Cypress.AUTWindow) => {
            cy.stub(win.Date, "now").returns(expiredNow);
          });
      },
    );

    mockAuthProviderAndJwtSignIn();
    appBody().findByRole("button", { name: "Refresh orders" }).click();

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession").then(
      ({ response }) => {
        expect(response?.statusCode).to.eq(200);

        cy.wait("@ordersQuery").then(({ request, response: queryResponse }) => {
          expect(request.headers["x-metabase-session"]).to.eq(
            response?.body.id,
          );
          expect(queryResponse?.statusCode).to.eq(202);
        });
      },
    );

    appBody().findByLabelText("Order count").should("have.text", "18760");
    appBody()
      .findByRole("textbox", { name: "Notes" })
      .should("have.value", "Keep this draft");
    appBody()
      .findByTestId("current-pathname")
      .should("have.text", "/orders/details");

    cy.get("@ssoSession.all").should("have.length", 2);
    cy.get("@appDocument.all").should("have.length", 1);
    cy.get("@appBundle.all").should("have.length", 1);
  });
});

function loadApp(path: string) {
  return cy.get<EmbeddedDataApp>("@app").then(({ name }) =>
    H.loadSdkIframeEmbedTestPage({
      elements: [
        { component: "metabase-data-app", attributes: { path: name + path } },
      ],
      selector: APP_FRAME,
    }),
  );
}

function appBody() {
  return H.getSimpleEmbedIframeContent();
}

import type { EmbeddedDataApp } from "e2e/support/helpers";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

const { H } = cy;

const APP_FRAME = "iframe[data-metabase-embed]";

const loadDataApp = (path: string) =>
  cy.get<EmbeddedDataApp>("@app").then(({ name }) =>
    H.loadSdkIframeEmbedTestPage({
      elements: [
        { component: "metabase-data-app", attributes: { path: name + path } },
      ],
      selector: APP_FRAME,
    }),
  );

describe("scenarios > embedding > metabase-data-app web component", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.createEmbeddedDataApp().as("app");

    cy.intercept("POST", "/auth/sso").as("ssoSession");
    cy.intercept("POST", "/api/dataset").as("ordersQuery");
  });

  it("renders a query and keeps navigation inside the iframe", () => {
    loadDataApp("/orders?view=recent");

    H.getSimpleEmbedIframeContent()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    cy.location("href").as("hostUrl");

    cy.log("location should match the web component's path attribute");
    cy.get<HTMLIFrameElement>(APP_FRAME)
      .its("0.contentWindow.location")
      .should((location) => {
        expect(location.pathname).to.eq(
          "/embed/embedded-apps/embedded-app/orders",
        );

        expect(location.search).to.include("view=recent");
      });

    H.getSimpleEmbedIframeContent()
      .findByRole("button", { name: "Order details" })
      .click();

    cy.log("path changes in data app router");
    H.getSimpleEmbedIframeContent()
      .findByTestId("current-pathname")
      .should("have.text", "/orders/details");

    cy.log("the host url remains the same");
    cy.get<string>("@hostUrl").then((url) =>
      cy.location("href").should("eq", url),
    );

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession").then(
      ({ response }) => {
        expect(response?.statusCode).to.eq(200);

        cy.log("uses sessions from host's SSO flow");
        cy.wait("@ordersQuery")
          .its("request.headers.x-metabase-session")
          .should("eq", response?.body.id);
      },
    );
  });
});

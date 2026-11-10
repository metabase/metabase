import type { EmbeddedDataApp } from "e2e/support/helpers";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { MetabaseDataAppElement } from "metabase/embedding/embedding-iframe-sdk/embed";

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

  it("renders a query and handles in-app and host navigation", () => {
    loadDataApp("/orders?view=recent");

    H.getSimpleEmbedIframeContent()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    H.getSimpleEmbedIframeContent()
      .findByLabelText("Notes")
      .type("Keep this note");

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

    cy.log("host writes the same path again after in-app navigation");
    cy.get<EmbeddedDataApp>("@app").then(({ name }) => {
      cy.get<MetabaseDataAppElement>("metabase-data-app").then(([element]) => {
        element.path = `${name}/orders?view=recent`;
      });
    });

    cy.log("path should change to the new value");
    H.getSimpleEmbedIframeContent()
      .findByTestId("current-pathname")
      .should("have.text", "/orders");

    H.getSimpleEmbedIframeContent()
      .findByLabelText("Notes")
      .should("have.value", "Keep this note");

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

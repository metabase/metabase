import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import type {
  BaseEmbedTestPageOptions,
  EmbeddedDataApp,
} from "e2e/support/helpers";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { MetabaseDataAppElement } from "metabase/embedding/embedding-iframe-sdk/embed";

const { H } = cy;

const APP_FRAME = "iframe[data-metabase-embed]";

const loadDataApp = (
  path: string,
  options: Pick<BaseEmbedTestPageOptions, "metabaseConfig"> & {
    origin?: string;
  } = {},
) =>
  cy.get<EmbeddedDataApp>("@app").then(({ slug }) =>
    H.loadSdkIframeEmbedTestPage({
      ...options,
      elements: [
        { component: "metabase-data-app", attributes: { path: slug + path } },
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
    cy.get<EmbeddedDataApp>("@app").then(({ slug }) => {
      cy.get<MetabaseDataAppElement>("metabase-data-app").then(([element]) => {
        element.path = `${slug}/orders?view=recent`;
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

  it("reports the data app in the modular embedding setup event", () => {
    H.resetSnowplow();
    H.enableTracking();

    cy.visit("/");
    loadDataApp("/orders?customer=42", {
      origin: "http://different-than-metabase-instance.com",
    });

    H.getSimpleEmbedIframeContent()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    cy.log("the event omits the app slug, route, query string and host page");
    H.expectSnowplowEvent({
      event: {
        page_urlpath: "/embed/embedded-apps",
        page_urlquery: (query: string | null) => !query,
        refr_urlhost: (host: string | null) => !host,
        unstruct_event: {
          data: {
            data: {
              event: "setup",
              global: { auth_method: "sso", locale_used: false },
              components: [{ name: "data_app", properties: [] }],
            },
          },
        },
      },
    });

    H.expectNoBadSnowplowEvents();
  });
});

describe("scenarios > embedding > metabase-data-app web component > draft app (DAT-125)", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.createEmbeddedDataApp().as("app");

    cy.get<EmbeddedDataApp>("@app").then(({ slug }) =>
      cy.request("POST", `/api/ee/apps/${slug}/groups`, {
        group_ids: [USER_GROUPS.DATA_GROUP],
      }),
    );

    cy.signOut();
    mockAuthProviderAndJwtSignIn(USERS.normal);
  });

  it("tells a user in an assigned group that a draft app is not live", () => {
    cy.log("a user in an assigned group runs the live app");
    loadDataApp("/orders");

    H.getSimpleEmbedIframeContent()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    cy.log("an admin makes the app a draft");
    cy.signInAsAdmin();

    cy.get<EmbeddedDataApp>("@app").then(({ slug }) =>
      cy.request("PUT", `/api/ee/apps/${slug}`, { enabled: false }),
    );

    cy.signOut();

    cy.log("the embed says the app is not live, not that access is denied");
    loadDataApp("/orders");

    H.getSimpleEmbedIframeContent()
      .findByText(
        'Data app "embedded-app" was not found or is disabled. Check the app slug in the path.',
        { timeout: 30_000 },
      )
      .should("be.visible");

    H.getSimpleEmbedIframeContent()
      .findByText(/have access to this data app/)
      .should("not.exist");
  });
});

describe("scenarios > embedding > metabase-data-app web component > local API key (DAT-18)", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ enabledAuthMethods: ["api-key"] });
    H.createEmbeddedDataApp().as("app");

    cy.intercept("POST", "/api/dataset").as("ordersQuery");
  });

  it("runs the app on an API key from localhost and refuses the key from a production host", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      cy.log("a localhost page runs the app on the key");
      loadDataApp("/orders", { metabaseConfig: { apiKey } });

      H.getSimpleEmbedIframeContent()
        .findByLabelText("Order count", { timeout: 30_000 })
        .should("have.text", "18760");

      cy.wait("@ordersQuery")
        .its("request.headers.x-api-key")
        .should("eq", apiKey);

      cy.log("restore the current page's domain");
      cy.visit("http://localhost:4000");

      cy.log("a production page shows why the key is refused");
      loadDataApp("/orders", {
        origin: "http://example.com",
        metabaseConfig: { apiKey },
      });

      H.getSimpleEmbedIframeContent()
        .findByText("Using an API key in production is not allowed.")
        .should("be.visible");

      H.getSimpleEmbedIframeContent()
        .findByLabelText("Order count")
        .should("not.exist");
    });
  });
});

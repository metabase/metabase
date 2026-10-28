import {
  DataApp,
  InteractiveQuestion,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { EmbeddedDataApp } from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import {
  getSignedJwtForUser,
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { defer } from "metabase/utils/promise";

const { H } = cy;

const APP_FRAME = 'iframe[title="Data app"]';

describe("scenarios > embedding-sdk > data app (DAT-15)", () => {
  let removeSessionListener = () => {};

  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    H.updateSetting("enable-embedding-modular", true);
    H.createEmbeddedDataApp().as("app");
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "**/app/embed.js").as("embedJs");
    cy.intercept("POST", "/auth/sso").as("ssoSession");
    cy.intercept("GET", "/api/ee/apps/embedded-app/bundle").as("appBundle");
    cy.intercept("GET", "/embed/embedded-apps/embedded-app/**").as(
      "appDocument",
    );

    cy.intercept("POST", "/api/dataset", (request) => {
      request.alias =
        request.headers["x-metabase-client"] === "data-app"
          ? "appQuery"
          : "nativeQuery";
    });
  });

  afterEach(() => {
    removeSessionListener();
    removeSessionListener = () => {};
  });

  it("shares the provider session with native SDK content without embed.js", () => {
    cy.get<EmbeddedDataApp>("@app").then(({ name, questionId }) =>
      mountSdkContent(
        <>
          <StaticQuestion questionId={questionId} height={250} />
          <DataApp path={`${name}/orders?view=recent`} height={400} />
        </>,
      ),
    );

    getSdkRoot().findByText("18,760", { timeout: 30_000 }).should("be.visible");
    appBody()
      .findByLabelText("Order count", { timeout: 30_000 })
      .should("have.text", "18760");

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession").then(
      ({ response }) => {
        expect(response?.statusCode).to.eq(200);

        cy.wait("@appQuery")
          .its("request.headers.x-metabase-session")
          .should("eq", response?.body.id);
      },
    );

    cy.get("@ssoSession.all").should("have.length", 1);
    cy.get("@embedJs.all").should("have.length", 0);
  });

  it("shares one session refresh across native queries and multiple app frames", () => {
    cy.then(() => getSignedJwtForUser({ expiredInSeconds: 60 })).then((jwt) =>
      mockAuthProviderAndJwtSignIn(undefined, { jwt }),
    );

    cy.get<EmbeddedDataApp>("@app").then(({ name }) =>
      mountSdkContent(
        <>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} height={400} />
          <DataApp path={`${name}/orders`} height={300} />
          <DataApp path={`${name}/orders/details?tab=summary`} height={300} />
        </>,
      ),
    );

    getSdkRoot().findByText("Orders", { timeout: 30_000 }).should("be.visible");
    H.tableInteractive().should("contain", "Product ID");

    cy.get(APP_FRAME).should("have.length", 2);
    for (const index of [0, 1]) {
      appBody({ index, count: 2 })
        .findByLabelText("Order count", { timeout: 30_000 })
        .should("have.text", "18760");
      appBody({ index, count: 2 })
        .findByRole("textbox", { name: "Notes" })
        .type(`Frame ${index + 1} draft`);
    }

    cy.wait(["@appQuery", "@appQuery"]);
    getSdkRoot().findByText("Group").click();
    getSdkRoot().findByRole("dialog").should("be.visible");

    const sessionRequests = new Set<MessageEventSource | null>();

    cy.window().then((win) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === "metabase.embed.requestSessionToken") {
          sessionRequests.add(event.source);
        }
      };

      win.addEventListener("message", onMessage);
      removeSessionListener = () =>
        win.removeEventListener("message", onMessage);
    });

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession").then(
      ({ response }) => {
        expect(response?.body.exp).to.be.a("number");
        const expiredNow = (Number(response?.body.exp) + 5) * 1000;

        // Expiry is checked independently by the provider and each app runtime.
        cy.window().then((win) => cy.stub(win.Date, "now").returns(expiredNow));

        cy.get<HTMLIFrameElement>(APP_FRAME).each(($frame) => {
          cy.wrap($frame)
            .its("0.contentWindow")
            .then((win: Cypress.AUTWindow) => {
              cy.stub(win.Date, "now").returns(expiredNow);
            });
        });
      },
    );

    const refresh = defer();

    mockAuthProviderAndJwtSignIn(undefined, {
      waitForPromise: () => refresh.promise,
    });

    getSdkRoot().findByRole("dialog").contains(/^ID$/).click();
    getSdkRoot().findByText("Doing science...").should("exist");
    getSdkRoot()
      .findByRole("dialog")
      .findByTestId("badge-remove-button")
      .click();

    for (const index of [0, 1]) {
      appBody({ index, count: 2 })
        .findByRole("button", { name: "Refresh orders" })
        .click();
    }

    // Hold the provider response until both frames have requested a refresh.
    cy.wrap(sessionRequests, { log: false }).should("have.property", "size", 2);
    cy.then(() => refresh.resolve());

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession")
      .its("response.body")
      .as("refreshedSession");

    cy.get<MetabaseEmbeddingSessionToken>("@refreshedSession").then(
      ({ id }) => {
        for (const alias of ["@nativeQuery", "@appQuery", "@appQuery"]) {
          cy.wait(alias).then(({ request, response }) => {
            expect(request.headers["x-metabase-session"]).to.eq(id);
            expect(response?.statusCode).to.eq(202);
          });
        }
      },
    );

    H.tableInteractive().should("contain", "Product ID");

    for (const index of [0, 1]) {
      appBody({ index, count: 2 })
        .findByLabelText("Order count")
        .should("have.text", "18760");
      appBody({ index, count: 2 })
        .findByRole("textbox", { name: "Notes" })
        .should("have.value", `Frame ${index + 1} draft`);
    }

    cy.get("@ssoSession.all").should("have.length", 2);
    cy.get("@appDocument.all").should("have.length", 2);
    cy.get("@appBundle.all").should("have.length", 2);
  });
});

function appBody({ index = 0, count = 1 } = {}) {
  return cy
    .get<HTMLIFrameElement>(APP_FRAME)
    .should("have.length", count)
    .eq(index)
    .its("0.contentDocument.body")
    .should("not.be.empty")
    .then(cy.wrap);
}

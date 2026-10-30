import { DataApp, InteractiveQuestion } from "@metabase/embedding-sdk-react";

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

const APP_FRAME = 'iframe[data-metabase-embed="true"]';

describe("scenarios > embedding-sdk > data app component", () => {
  let removeSessionListener = () => {};

  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    H.updateSetting("enable-embedding-modular", true);
    H.createEmbeddedDataApp().as("app");

    cy.signOut();

    cy.intercept("POST", "/auth/sso").as("ssoSession");
    cy.intercept("POST", "/api/card/*/query").as("nativeQuery");

    cy.intercept("POST", "/api/dataset", (request) => {
      if (request.headers["x-metabase-client"] !== "data-app") {
        request.alias = "nativeQuery";
        return;
      }

      // same-origin requests keep the iframe's route in the `Referer` header.
      const { pathname } = new URL(String(request.headers.referer));

      if (pathname.endsWith("/orders/details")) {
        request.alias = "appOrderDetailsQuery";
      } else if (pathname.endsWith("/orders")) {
        request.alias = "appOrdersQuery";
      }
    });
  });

  afterEach(() => {
    removeSessionListener();
    removeSessionListener = () => {};
  });

  it("shares the session across data app iframes and SDK components", () => {
    cy.then(() => getSignedJwtForUser({ expiredInSeconds: 60 })).then((jwt) =>
      mockAuthProviderAndJwtSignIn(undefined, { jwt }),
    );

    cy.log("mount two app frames and an interactive question");
    cy.get<EmbeddedDataApp>("@app").then(({ name }) =>
      mountSdkContent(
        <>
          <DataApp path={`${name}/orders`} height={300} />
          <DataApp path={`${name}/orders/details?tab=summary`} height={300} />

          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} height={400} />
        </>,
      ),
    );

    for (const index of [0, 1]) {
      dataAppIframe(index)
        .findByLabelText("Order count", { timeout: 30_000 })
        .should("have.text", "18760");
    }

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession")
      .its("response.body")
      .as("initialSession");

    cy.log("uses the same session across all queries");
    checkQuerySessions("@initialSession");
    H.tableInteractive().should("contain", "Product ID");
    cy.get("@ssoSession.all").should("have.length", 1);

    getSdkRoot().findByText("Group").click();
    getSdkRoot().findByRole("dialog").should("be.visible");

    cy.log("expire the current session");
    const sessionRequests = trackFrameSessionRequests();
    expireProviderAndFrameSessions("@initialSession");

    const refresh = defer();

    mockAuthProviderAndJwtSignIn(undefined, {
      waitForPromise: () => refresh.promise,
    });

    getSdkRoot().findByRole("dialog").contains(/^ID$/).click();
    getSdkRoot().findByText("Doing science...").should("exist");

    for (const index of [0, 1]) {
      dataAppIframe(index)
        .findByRole("button", { name: "Refresh orders" })
        .click();
    }

    cy.log("wait until both iframes requests a refresh");
    cy.wrap(sessionRequests, { log: false }).should("have.property", "size", 2);

    cy.log("resolves the session refresh");
    cy.then(() => refresh.resolve());

    cy.wait<unknown, MetabaseEmbeddingSessionToken>("@ssoSession")
      .its("response.body")
      .as("refreshedSession");

    checkQuerySessions("@refreshedSession");

    cy.log("session should be refreshed in interactive question");
    H.tableInteractiveHeader()
      .findByText("ID", { exact: true })
      .should("be.visible");

    cy.log("session should be refreshed in both data app iframes");
    for (const index of [0, 1]) {
      dataAppIframe(index)
        .findByLabelText("Order count")
        .should("have.text", "18760");
    }

    cy.get("@ssoSession.all").should("have.length", 2);
  });

  function trackFrameSessionRequests() {
    const requests = new Set<MessageEventSource>();

    cy.get<HTMLIFrameElement>(APP_FRAME)
      .should("have.length", 2)
      .then(($frames) => {
        const frameWindows = new Set<MessageEventSource | null>(
          $frames.toArray().map((frame) => frame.contentWindow),
        );

        cy.window().then((win) => {
          const onMessage = (event: MessageEvent) => {
            if (
              event.data?.type === "metabase.embed.requestSessionToken" &&
              event.source !== null &&
              frameWindows.has(event.source)
            ) {
              requests.add(event.source);
            }
          };

          win.addEventListener("message", onMessage);

          removeSessionListener = () =>
            win.removeEventListener("message", onMessage);
        });
      });

    return requests;
  }
});

const expireProviderAndFrameSessions = (sessionAlias: string) =>
  cy.get<MetabaseEmbeddingSessionToken>(sessionAlias).then(({ exp }) => {
    expect(exp).to.be.a("number");

    // stub `Date.now` on the host to be beyond session expiry time
    const expiredNow = (Number(exp) + 5) * 1000;
    cy.window().then((win) => cy.stub(win.Date, "now").returns(expiredNow));

    cy.get<HTMLIFrameElement>(APP_FRAME).each(($frame) => {
      cy.wrap($frame)
        .its("0.contentWindow")
        .then((win: Cypress.AUTWindow) => {
          // stub `Date.now` on each iframe as well
          cy.stub(win.Date, "now").returns(expiredNow);
        });
    });
  });

const dataAppIframe = (index: number) =>
  cy
    .get<HTMLIFrameElement>(APP_FRAME)
    .should("have.length", 2)
    .eq(index)
    .its("0.contentDocument.body")
    .should("not.be.empty")
    .then(cy.wrap);

const checkQuerySessions = (sessionAlias: string) =>
  cy.get<MetabaseEmbeddingSessionToken>(sessionAlias).then(({ id }) => {
    for (const alias of [
      "@nativeQuery",
      "@appOrdersQuery",
      "@appOrderDetailsQuery",
    ]) {
      cy.wait(alias).then(({ request, response }) => {
        expect(request.headers["x-metabase-session"]).to.eq(id);
        expect(response?.statusCode).to.eq(202);
      });
    }
  });

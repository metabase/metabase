import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  getSdkBundleScriptElement,
  mountSdk,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  AUTH_PROVIDER_URL,
  METABASE_INSTANCE_URL,
} from "e2e/support/helpers/embedding-sdk-helpers/constants";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";
import { defer } from "metabase/lib/promise";

const { H } = cy;

const sdkBundleCleanup = () => {
  getSdkBundleScriptElement()?.remove();
  delete (window as any).METABASE_EMBEDDING_SDK_BUNDLE;
  delete (window as any).METABASE_PROVIDER_PROPS_STORE;
  delete (window as any).METABASE_EMBEDDING_SDK_AUTH_STATE;
  // Clean up webpack chunk registries so stale runtimes from a previous test
  // don't interfere with chunks loaded by the next test.
  delete (window as any).webpackChunkembedding_sdk_bundle;
  delete (window as any).webpackChunkembedding_sdk_legacy;
  deleteConflictingCljsGlobals();
};

describe(
  "scenarios > embedding-sdk > loading-performance",
  {
    tags: ["@skip-backward-compatibility"],
    numTestsKeptInMemory: 1,
  },
  () => {
    beforeEach(() => {
      H.clearBrowserCache();
      sdkBundleCleanup();

      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    describe("Bundle loading modes", () => {
      it("useLegacyMonolithicBundle=true: loads monolithic bundle, renders question, correct URL and script element", () => {
        cy.log("Intercepting bundle request");
        cy.intercept("GET", "**/app/embedding-sdk.js?*").as("bundleRequest");

        cy.log("Mounting with useLegacyMonolithicBundle=true");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              useLegacyMonolithicBundle: true,
              authConfig: { metabaseInstanceUrl: METABASE_INSTANCE_URL },
            },
          },
        );

        cy.log("Checking question renders");
        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.log(
          "Checking request URL has packageVersion and useLegacyMonolithicBundle params",
        );
        cy.get("@bundleRequest.all").then((interceptions: any) => {
          expect(interceptions.length).to.be.greaterThan(0);
          expect(interceptions[0].request.url).to.include("packageVersion=");
          expect(interceptions[0].request.url).to.include(
            "useLegacyMonolithicBundle=true",
          );
        });

        cy.log("Checking window.METABASE_EMBEDDING_SDK_BUNDLE");
        cy.window()
          .its("METABASE_EMBEDDING_SDK_BUNDLE")
          .should("exist")
          .and("have.property", "InteractiveQuestion");

        cy.log("Checking script element has data-embedding-sdk-bundle attr");
        cy.document().then((doc) => {
          const script = doc.querySelector(
            '[data-embedding-sdk-bundle="true"]',
          );
          expect(script).to.not.be.null;
          expect(script?.tagName).to.equal("SCRIPT");
        });
      });

      it("useLegacyMonolithicBundle=false (default): loads bootstrap + chunks, renders question, correct URL and script element", () => {
        cy.log("Intercepting bundle request");
        cy.intercept("GET", "**/app/embedding-sdk.js?*").as("bundleRequest");
        cy.intercept("GET", "**/app/embedding-sdk/chunks/*.js").as(
          "chunkRequest",
        );

        cy.log("Mounting with default useLegacyMonolithicBundle value (false)");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        cy.log("Checking question renders");
        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.log(
          "Checking request URL has packageVersion but no useLegacyMonolithicBundle",
        );
        cy.get("@bundleRequest.all").then((interceptions: any) => {
          expect(interceptions.length).to.be.greaterThan(0);
          expect(interceptions[0].request.url).to.include("packageVersion=");
          expect(interceptions[0].request.url).to.not.include(
            "useLegacyMonolithicBundle",
          );
        });
        cy.log("Checking chunk requests happened (proves bootstrap path)");
        cy.get("@chunkRequest.all").then((interceptions: any) => {
          expect(interceptions.length).to.be.greaterThan(0);
        });

        cy.log("Checking window.METABASE_EMBEDDING_SDK_BUNDLE");
        cy.window().its("METABASE_EMBEDDING_SDK_BUNDLE").should("exist");

        cy.log("Checking script element has data-embedding-sdk-bundle attr");
        cy.document().then((doc) => {
          const script = doc.querySelector(
            '[data-embedding-sdk-bundle="true"]',
          );
          expect(script).to.not.be.null;
        });
      });
    });

    describe("Error handling", () => {
      it("shows error when bundle returns 404", () => {
        cy.log("Intercepting bundle with 404");
        cy.intercept("GET", "**/app/embedding-sdk.js*", { statusCode: 404 });

        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          { waitForUser: false },
        );

        cy.log("Checking error container is shown");
        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Error loading the Embedded Analytics SDK",
        );
      });

      it("shows error when bundle has a network error (not 404)", () => {
        cy.log("Intercepting bundle with network error (forceNetworkError)");
        cy.intercept("GET", "**/app/embedding-sdk.js*", {
          forceNetworkError: true,
        });

        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          { waitForUser: false },
        );

        cy.log("Checking error container is shown");
        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Error loading the Embedded Analytics SDK",
        );
      });

      it("shows error when chunk loading fails", () => {
        cy.log("Intercepting chunk requests with network error");
        cy.intercept("GET", /embedding-sdk\/chunks\/.*\.js/, {
          forceNetworkError: true,
        }).as("chunkRequest");

        cy.log("Mounting with bootstrap (default)");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          { waitForUser: false },
        );

        cy.log("Checking error container is shown");
        cy.findByTestId("sdk-error-container").should(
          "contain.text",
          "Error loading the Embedded Analytics SDK",
        );
      });
    });

    describe("Loading behavior", () => {
      it("shows custom loader while bundle is loading", () => {
        const bundleRequestDeferred = defer<void>();

        cy.log("Intercepting bundle with deferred response");
        cy.intercept(
          {
            method: "GET",
            url: "**/app/embedding-sdk.js*",
            times: 1,
          },
          () => bundleRequestDeferred.promise,
        ).as("bundleRequest");

        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              loaderComponent: () => <div>SDK is loading...</div>,
            },
            waitForUser: false,
          },
        );

        cy.log("Checking custom loader is rendered");
        cy.findByTestId("loading-indicator").should(
          "contain.text",
          "SDK is loading...",
        );

        cy.log("Resolving deferred bundle request");
        cy.then(() => bundleRequestDeferred.resolve());

        cy.log("Waiting for bundle to finish loading");
        cy.wait("@bundleRequest");

        cy.log("Checking question renders and loader disappears");
        getSdkRoot().within(() => {
          cy.findByText("Orders", { timeout: 20_000 }).should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });
        cy.findByTestId("loading-indicator").should("not.exist");
      });

      it("no duplicate script elements on remount, store cleaned up on unmount", () => {
        cy.log("First mount");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Checking 1 script element after first mount");
        cy.document().then((doc) => {
          const scripts = doc.querySelectorAll(
            '[data-embedding-sdk-bundle="true"]',
          );
          expect(scripts.length).to.equal(1);
        });

        cy.log("Remounting");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Checking still 1 script element after remount");
        cy.document().then((doc) => {
          const scripts = doc.querySelectorAll(
            '[data-embedding-sdk-bundle="true"]',
          );
          expect(scripts.length).to.equal(1);
        });

        cy.log("Unmounting");
        cy.mount(<></>);

        cy.log("Checking METABASE_PROVIDER_PROPS_STORE cleaned up");
        cy.window().should((win) => {
          expect((win as any).METABASE_PROVIDER_PROPS_STORE).to.be.undefined;
        });
      });

      it("remount after loaded skips re-download", () => {
        cy.log("Intercepting bundle requests");
        cy.intercept("GET", "**/app/embedding-sdk.js?*").as("bundleRequest");

        cy.log("First mount");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Checking bundle global exists");
        cy.window().its("METABASE_EMBEDDING_SDK_BUNDLE").should("exist");

        cy.log("Unmounting");
        cy.mount(<></>);

        cy.log("Remounting — should skip Loading state");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Checking total bundle requests is at most 1");
        cy.get("@bundleRequest.all").then((interceptions: any) => {
          expect(interceptions.length).to.be.at.most(1);
        });
      });

      it("rapid unmount during active loading, then remount renders correctly", () => {
        cy.log("Intercepting bundle request with delay to keep loading active");
        cy.intercept("GET", "**/app/embedding-sdk.js*", (req) => {
          req.continue((res) => {
            res.setDelay(1500);
          });
        }).as("bundleRequest");

        cy.log("First mount — starts delayed bundle loading");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          { waitForUser: false },
        );

        cy.log("Immediately unmounting while bundle may still be loading");
        cy.mount(<></>);

        cy.log("Remounting after unmount");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        cy.log("Checking question renders correctly after rapid remount");
        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.log("Checking bundle global is set");
        cy.window().its("METABASE_EMBEDDING_SDK_BUNDLE").should("exist");

        cy.log("Checking delayed bundle was requested only once");
        cy.get("@bundleRequest.all").then((interceptions: any) => {
          expect(interceptions.length).to.equal(1);
        });
      });
    });

    describe("Auth request counts", () => {
      beforeEach(() => {
        cy.intercept("GET", /\/auth\/sso(\?preferred_method=\w+)?$/).as(
          "authSsoDiscovery",
        );
        cy.intercept("GET", /\/auth\/sso\?.*jwt=/).as("authSsoTokenExchange");
        cy.intercept("GET", "/api/user/current").as("getCurrentUser");
        cy.intercept("GET", "/api/session/properties").as(
          "getSessionProperties",
        );
      });

      it("without jwtProviderUri: makes SSO discovery request + token exchange", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: {
                metabaseInstanceUrl: METABASE_INSTANCE_URL,
              },
            },
          },
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.get("@authSsoDiscovery.all").should("have.length", 1);
        cy.get("@authSsoTokenExchange.all").should("have.length", 1);
        cy.get("@getCurrentUser.all").should("have.length", 1);
        cy.get("@getSessionProperties.all").should("have.length", 1);
      });

      it("with jwtProviderUri: skips SSO discovery", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: {
                metabaseInstanceUrl: METABASE_INSTANCE_URL,
                preferredAuthMethod: "jwt",
                jwtProviderUri: AUTH_PROVIDER_URL,
              },
            },
          },
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.get("@authSsoDiscovery.all").should("have.length", 0);
        cy.get("@authSsoTokenExchange.all").should("have.length", 1);
        cy.get("@getCurrentUser.all").should("have.length", 1);
        cy.get("@getSessionProperties.all").should("have.length", 1);
      });

      it("without jwtProviderUri: no runaway request duplicates", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: { metabaseInstanceUrl: METABASE_INSTANCE_URL },
            },
          },
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Checking request counts");
        cy.get("@authSsoDiscovery.all").then((i: any) => {
          cy.log(`SSO discovery: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
        cy.get("@authSsoTokenExchange.all").then((i: any) => {
          cy.log(`SSO token exchange: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
        cy.get("@getCurrentUser.all").then((i: any) => {
          cy.log(`getCurrentUser: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
        cy.get("@getSessionProperties.all").then((i: any) => {
          cy.log(`getSessionProperties: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
      });

      it("with jwtProviderUri: skips discovery, no runaway request duplicates", () => {
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: {
                metabaseInstanceUrl: METABASE_INSTANCE_URL,
                preferredAuthMethod: "jwt",
                jwtProviderUri: AUTH_PROVIDER_URL,
              },
            },
          },
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Checking request counts");
        cy.get("@authSsoDiscovery.all").then((i: any) => {
          cy.log(`SSO discovery: ${i.length} (expected 0)`);
          expect(i.length).to.equal(0);
        });
        cy.get("@authSsoTokenExchange.all").then((i: any) => {
          cy.log(`SSO token exchange: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
        cy.get("@getCurrentUser.all").then((i: any) => {
          cy.log(`getCurrentUser: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
        cy.get("@getSessionProperties.all").then((i: any) => {
          cy.log(`getSessionProperties: ${i.length}`);
          expect(i.length).to.be.at.least(1);
          expect(i.length).to.be.at.most(2);
        });
      });

      it("extra CustomEvent after settle is harmless (no extra requests)", () => {
        cy.intercept("GET", "**/app/embedding-sdk.js?*").as("bundleRequest");

        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
        );

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.log("Capturing baseline request counts");
        const baseline: Record<string, number> = {};
        cy.get("@bundleRequest.all").then((i: any) => {
          baseline.bundleRequest = i.length;
        });
        cy.get("@authSsoDiscovery.all").then((i: any) => {
          baseline.authSsoDiscovery = i.length;
        });
        cy.get("@authSsoTokenExchange.all").then((i: any) => {
          baseline.authSsoTokenExchange = i.length;
        });
        cy.get("@getCurrentUser.all").then((i: any) => {
          baseline.getCurrentUser = i.length;
        });
        cy.get("@getSessionProperties.all").then((i: any) => {
          baseline.getSessionProperties = i.length;
        });

        cy.log("Dispatching extra metabase-sdk-bundle-loaded event");
        cy.document().then((doc) => {
          doc.dispatchEvent(new CustomEvent("metabase-sdk-bundle-loaded"));
        });

        cy.log(
          "Checking question still renders and no extra requests were fired",
        );
        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });
        cy.get("@bundleRequest.all").then((i: any) => {
          expect(i.length).to.equal(baseline.bundleRequest);
        });
        cy.get("@authSsoDiscovery.all").then((i: any) => {
          expect(i.length).to.equal(baseline.authSsoDiscovery);
        });
        cy.get("@authSsoTokenExchange.all").then((i: any) => {
          expect(i.length).to.equal(baseline.authSsoTokenExchange);
        });
        cy.get("@getCurrentUser.all").then((i: any) => {
          expect(i.length).to.equal(baseline.getCurrentUser);
        });
        cy.get("@getSessionProperties.all").then((i: any) => {
          expect(i.length).to.equal(baseline.getSessionProperties);
        });
      });
    });

    describe("Bootstrap auth edge cases", () => {
      it("skips bootstrap auth when preferredAuthMethod is saml", () => {
        cy.log("Mounting with preferredAuthMethod: saml");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: {
                metabaseInstanceUrl: METABASE_INSTANCE_URL,
                preferredAuthMethod: "saml",
              },
            },
          },
        );

        cy.log("Checking bootstrap auth state is 'skipped'");
        cy.window()
          .its("METABASE_EMBEDDING_SDK_AUTH_STATE")
          .should("have.property", "status", "skipped");
      });

      it("skips bootstrap auth when SSO discovery returns SAML", () => {
        cy.log("Intercepting SSO discovery to return SAML for bootstrap");
        let firstSsoDiscovery = true;
        cy.intercept("GET", "**/auth/sso*", (req) => {
          if (!req.url.includes("jwt=") && firstSsoDiscovery) {
            firstSsoDiscovery = false;
            req.reply({
              statusCode: 200,
              body: {
                method: "saml",
                url: "https://fake-saml-idp.example.com/sso",
              },
            });
            return;
          }
          req.continue();
        });

        cy.log("Mounting");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: { metabaseInstanceUrl: METABASE_INSTANCE_URL },
            },
            waitForUser: false,
          },
        );

        cy.log("Checking bootstrap auth state is 'skipped'");
        cy.window()
          .its("METABASE_EMBEDDING_SDK_AUTH_STATE")
          .should("have.property", "status", "skipped");
      });

      it("falls back to normal auth when bootstrap auth fails", () => {
        cy.log(
          "Intercepting first SSO discovery call to make bootstrap auth fail",
        );
        let bootstrapSsoFailed = false;
        cy.intercept("GET", "**/auth/sso*", (req) => {
          // Fail only the first SSO discovery call (no jwt= param).
          // This is the one made by the bootstrap auth.
          // Subsequent calls (normal auth fallback) pass through.
          if (!req.url.includes("jwt=") && !bootstrapSsoFailed) {
            bootstrapSsoFailed = true;
            req.reply({
              statusCode: 500,
              body: { error: "simulated bootstrap SSO failure" },
            });
            return;
          }
          req.continue();
        }).as("ssoRequest");

        cy.window().then((win) => {
          cy.spy(win.console, "warn").as("consoleWarn");
        });

        cy.log("Mounting");
        mountSdkContent(
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />,
          {
            sdkProviderProps: {
              authConfig: { metabaseInstanceUrl: METABASE_INSTANCE_URL },
            },
            waitForUser: false,
          },
        );

        cy.log("Checking question renders via normal auth fallback");
        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByTestId("visualization-root").should("be.visible");
        });

        cy.log("Checking fallback warning was logged");
        cy.get("@consoleWarn").should(
          "be.calledWithMatch",
          /Falling back to normal auth flow/,
        );
      });
    });
  },
);

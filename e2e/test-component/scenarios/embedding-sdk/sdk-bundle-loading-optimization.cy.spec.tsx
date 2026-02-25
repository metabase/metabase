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
  "scenarios > embedding-sdk > sdk-bundle-loading-optimization",
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

    it("bootstrap=false: loads monolithic bundle, renders question, correct URL and script element", () => {
      cy.log("Intercepting bundle request");
      cy.intercept("GET", "**/app/embedding-sdk.js*").as("bundleRequest");

      cy.log("Mounting with bootstrap=false");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          bootstrap: false,
          authConfig: { metabaseInstanceUrl: METABASE_INSTANCE_URL },
        },
      });

      cy.log("Checking question renders");
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      cy.log("Checking request URL has no packageVersion");
      cy.get("@bundleRequest.all").then((interceptions: any) => {
        expect(interceptions.length).to.be.greaterThan(0);
        expect(interceptions[0].request.url).to.not.include("packageVersion");
      });

      cy.log("Checking window.METABASE_EMBEDDING_SDK_BUNDLE");
      cy.window()
        .its("METABASE_EMBEDDING_SDK_BUNDLE")
        .should("exist")
        .and("have.property", "InteractiveQuestion");

      cy.log("Checking script element has data-embedding-sdk-bundle attr");
      cy.document().then((doc) => {
        const script = doc.querySelector('[data-embedding-sdk-bundle="true"]');
        expect(script).to.not.be.null;
        expect(script?.tagName).to.equal("SCRIPT");
      });
    });

    it("bootstrap=true (default): loads bootstrap, renders question, correct URL and script element", () => {
      cy.log("Intercepting bundle request");
      cy.intercept("GET", "**/app/embedding-sdk.js*").as("bundleRequest");

      cy.log("Mounting with default bootstrap (true)");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

      cy.log("Checking question renders");
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      cy.log("Checking request URL has packageVersion");
      cy.get("@bundleRequest.all").then((interceptions: any) => {
        expect(interceptions.length).to.be.greaterThan(0);
        expect(interceptions[0].request.url).to.include("packageVersion=");
      });

      cy.log("Checking window.METABASE_EMBEDDING_SDK_BUNDLE");
      cy.window().its("METABASE_EMBEDDING_SDK_BUNDLE").should("exist");

      cy.log("Checking script element has data-embedding-sdk-bundle attr");
      cy.document().then((doc) => {
        const script = doc.querySelector('[data-embedding-sdk-bundle="true"]');
        expect(script).to.not.be.null;
      });
    });

    it("shows error when bundle returns 404", () => {
      cy.log("Intercepting bundle with 404");
      cy.intercept("GET", "**/app/embedding-sdk.js*", { statusCode: 404 });

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        waitForUser: false,
      });

      cy.log("Checking error container is shown");
      cy.findByTestId("sdk-error-container").should(
        "contain.text",
        "Error loading the Embedded Analytics SDK",
      );
    });

    it("shows custom loader while bundle is loading", () => {
      cy.log("Intercepting bundle with never-resolving request");
      cy.intercept("GET", "**/app/embedding-sdk.js*", () => {
        return new Promise(() => {}); // never resolves
      });

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          loaderComponent: () => <div>SDK is loading...</div>,
        },
        waitForUser: false,
      });

      cy.log("Checking custom loader is rendered");
      cy.findByTestId("loading-indicator").should(
        "contain.text",
        "SDK is loading...",
      );
    });

    it("no duplicate script elements on remount, store cleaned up on unmount", () => {
      cy.log("First mount");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

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
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

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
      cy.window().its("METABASE_PROVIDER_PROPS_STORE").should("not.exist");
    });

    it("remount after loaded skips re-download", () => {
      cy.log("Intercepting bundle requests");
      cy.intercept("GET", "**/app/embedding-sdk.js*").as("bundleRequest");

      cy.log("First mount");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });

      cy.log("Checking bundle global exists");
      cy.window().its("METABASE_EMBEDDING_SDK_BUNDLE").should("exist");

      cy.log("Unmounting");
      cy.mount(<></>);

      cy.log("Remounting — should skip Loading state");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });

      cy.log("Checking total bundle requests is at most 1");
      cy.get("@bundleRequest.all").then((interceptions: any) => {
        expect(interceptions.length).to.be.at.most(1);
      });
    });

    it("request counts without jwtProviderUri: makes SSO discovery and token exchange", () => {
      cy.log("Intercepting auth endpoints");
      cy.intercept("GET", /\/auth\/sso(\?preferred_method=\w+)?$/).as(
        "authSsoDiscovery",
      );
      cy.intercept("GET", /\/auth\/sso\?.*jwt=/).as("authSsoTokenExchange");
      cy.intercept("GET", "/api/user/current").as("getCurrentUser");
      cy.intercept("GET", "/api/session/properties").as("getSessionProperties");

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: { metabaseInstanceUrl: METABASE_INSTANCE_URL },
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });

      cy.log("Checking request counts");
      // SSO discovery should happen at least once (bootstrap and/or bundle)
      cy.get("@authSsoDiscovery.all").then((i: any) => {
        cy.log(`SSO discovery: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
      // Token exchange should happen at least once
      cy.get("@authSsoTokenExchange.all").then((i: any) => {
        cy.log(`SSO token exchange: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
      // User and settings should be fetched
      cy.get("@getCurrentUser.all").then((i: any) => {
        cy.log(`getCurrentUser: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
      cy.get("@getSessionProperties.all").then((i: any) => {
        cy.log(`getSessionProperties: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
    });

    it("request counts with jwtProviderUri: skips SSO discovery", () => {
      cy.log("Intercepting auth endpoints");
      cy.intercept("GET", /\/auth\/sso(\?preferred_method=\w+)?$/).as(
        "authSsoDiscovery",
      );
      cy.intercept("GET", /\/auth\/sso\?.*jwt=/).as("authSsoTokenExchange");
      cy.intercept("GET", "/api/user/current").as("getCurrentUser");
      cy.intercept("GET", "/api/session/properties").as("getSessionProperties");

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
            preferredAuthMethod: "jwt",
            jwtProviderUri: AUTH_PROVIDER_URL,
          },
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });

      cy.log("Checking request counts");
      // With jwtProviderUri, SSO discovery should be skipped entirely
      cy.get("@authSsoDiscovery.all").then((i: any) => {
        cy.log(`SSO discovery: ${i.length} (expected 0)`);
        expect(i.length).to.equal(0);
      });
      // Token exchange should happen at least once
      cy.get("@authSsoTokenExchange.all").then((i: any) => {
        cy.log(`SSO token exchange: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
      // User and settings should be fetched
      cy.get("@getCurrentUser.all").then((i: any) => {
        cy.log(`getCurrentUser: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
      cy.get("@getSessionProperties.all").then((i: any) => {
        cy.log(`getSessionProperties: ${i.length}`);
        expect(i.length).to.be.at.least(1);
      });
    });

    it("extra CustomEvent after settle is harmless", () => {
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });

      cy.log("Dispatching extra metabase-sdk-bundle-loaded event");
      cy.document().then((doc) => {
        doc.dispatchEvent(new CustomEvent("metabase-sdk-bundle-loaded"));
      });

      cy.wait(500);

      cy.log("Checking question still renders (no crash)");
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });
    });

    it("shows error when bundle has a network error (not 404)", () => {
      cy.log("Intercepting bundle with network error (forceNetworkError)");
      cy.intercept("GET", "**/app/embedding-sdk.js*", {
        forceNetworkError: true,
      });

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        waitForUser: false,
      });

      cy.log("Checking error container is shown");
      cy.findByTestId("sdk-error-container").should(
        "contain.text",
        "Error loading the Embedded Analytics SDK",
      );
    });

    it("rapid unmount during loading, then remount renders correctly", () => {
      cy.log("First mount — starts bundle loading");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        waitForUser: false,
      });

      cy.log("Immediately unmounting while bundle may still be loading");
      cy.mount(<></>);

      cy.log("Remounting after unmount");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

      cy.log("Checking question renders correctly after rapid remount");
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      cy.log("Checking bundle global is set");
      cy.window().its("METABASE_EMBEDDING_SDK_BUNDLE").should("exist");
    });

    it("shows error when chunk loading fails", () => {
      cy.log("Intercepting chunk requests with network error");
      cy.intercept("GET", /embedding-sdk\/chunks\/.*\.js/, {
        forceNetworkError: true,
      }).as("chunkRequest");

      cy.log("Mounting with bootstrap (default)");
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        waitForUser: false,
      });

      cy.log("Checking error container is shown");
      cy.findByTestId("sdk-error-container").should(
        "contain.text",
        "Error loading the Embedded Analytics SDK",
      );
    });

    it("warns when multiple MetabaseProvider instances are rendered", () => {
      cy.window().then((win) => {
        cy.spy(win.console, "warn").as("consoleWarn");
      });

      cy.log("Mounting two MetabaseProviders");
      mountSdk(
        <>
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
          <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
            <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
          </MetabaseProvider>
        </>,
      );

      cy.log("Checking warning was fired");
      cy.get("@consoleWarn").should(
        "be.calledWithMatch",
        "Multiple instances of MetabaseProvider detected",
      );
    });
  },
);

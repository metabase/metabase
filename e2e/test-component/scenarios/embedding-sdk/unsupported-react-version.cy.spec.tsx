import {
  StaticQuestion,
  useMetabaseAuthStatus,
  useMetabot,
} from "@metabase/embedding-sdk-react";
import { DataAppDevProvider } from "@metabase/embedding-sdk-react/data-app-dev";
import * as React from "react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  getSdkBundleScriptElement,
  mountSdk,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";

// The React major the bundle is built with, which is what the check compares
// against. When Metabase drops React 18 and moves to 19, change this to 19:
// the spec then fakes a React 18 host and expects the React 19 message. Until
// someone does, every assertion here is wrong and the spec fails.
const MINIMUM_SUPPORTED_REACT_MAJOR = 18;

const UNSUPPORTED_HOST_REACT_MAJOR = MINIMUM_SUPPORTED_REACT_MAJOR - 1;

const UNSUPPORTED_REACT_ERROR = `The Metabase modular embedding SDK requires React ${MINIMUM_SUPPORTED_REACT_MAJOR} or newer, but this application is running React ${UNSUPPORTED_HOST_REACT_MAJOR}. Upgrade your application to React ${MINIMUM_SUPPORTED_REACT_MAJOR} to display embedded content.`;

// Component tests keep the page between tests, so each test has to load the
// bundle again: it reads the host React and logs the error only once per load.
const sdkBundleCleanup = () => {
  getSdkBundleScriptElement()?.remove();
  // Unjustified type cast. FIXME
  delete (window as any).METABASE_EMBEDDING_SDK_BUNDLE;
  // Unjustified type cast. FIXME
  delete (window as any).METABASE_PROVIDER_PROPS_STORE;
  // Unjustified type cast. FIXME
  delete (window as any).METABASE_EMBEDDING_SDK_AUTH_STATE;
  // Unjustified type cast. FIXME
  delete (window as any).webpackChunkembedding_sdk_bundle;
  // Unjustified type cast. FIXME
  delete (window as any).webpackChunkembedding_sdk_legacy;
  deleteConflictingCljsGlobals();
};

describe("scenarios > embedding-sdk > unsupported-react-version", () => {
  beforeEach(() => {
    sdkBundleCleanup();

    signInAsAdminAndEnableEmbeddingSdk();

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.window().then((win) => {
      cy.spy(win.console, "error").as("consoleError");

      // Only the version string is faked, standing in for any React older
      // than the SDK supports: the bundle reads the host's React from this
      // global when it loads, while the test keeps rendering with the real one.
      Object.assign(win, {
        METABASE_REACT: {
          ...React,
          version: `${UNSUPPORTED_HOST_REACT_MAJOR}.0.0`,
        },
      });
    });
  });

  it("shows an error in place of each SDK component and keeps the host app rendering", () => {
    mountSdkContent(
      <>
        <div data-testid="host-app-content">host app content</div>
        <StaticQuestion questionId={ORDERS_QUESTION_ID} />
        <StaticQuestion questionId={ORDERS_QUESTION_ID} />
      </>,
      // The SDK components never load, so there is no user request to wait on.
      { waitForUser: false },
    );

    cy.findAllByTestId("sdk-unsupported-react-version-error")
      .should("have.length", 2)
      .each((errorBox) => {
        cy.wrap(errorBox).should("have.text", UNSUPPORTED_REACT_ERROR);
      });
    cy.findByTestId("host-app-content").should("be.visible");
    cy.get("[data-cy-root]").findByText("Product ID").should("not.exist");

    assertUnsupportedReactErrorLoggedOnce();
  });

  // A hooks-only host renders nothing, so the console error is what says the
  // bundle loaded and ran the check, and the hook's value is what says the
  // entry behind it was swapped out (see sdk-bundle-exports.ts).
  it("does not start the SDK, so useMetabaseAuthStatus stays uninitialized", () => {
    mountSdkContent(<AuthStatus />, { waitForUser: false });

    assertUnsupportedReactErrorLoggedOnce();

    cy.findByTestId("host-hook-value").should("have.text", "uninitialized");
    cy.findByTestId("sdk-unsupported-react-version-error").should("not.exist");
  });

  it("does not render the Metabot subscriber, so useMetabot stays empty", () => {
    mountSdkContent(<Metabot />, { waitForUser: false });

    assertUnsupportedReactErrorLoggedOnce();

    cy.findByTestId("host-hook-value").should("have.text", "none");
    cy.findByTestId("sdk-unsupported-react-version-error").should("not.exist");
  });

  // A data app is built as its own Vite project and previewed with `npm run
  // dev`, so the React it runs is its author's while the bundle comes from the
  // instance. DataAppDevProvider is what that dev server mounts; a deployed
  // data app runs Metabase's own React and cannot mismatch.
  it("replaces a data app in dev mode with the error", () => {
    mountSdk(
      <DataAppDevProvider
        appSlug="unsupported-react-version"
        authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}
      >
        <div data-testid="data-app-content">data app content</div>
      </DataAppDevProvider>,
    );

    assertUnsupportedReactErrorLoggedOnce();

    cy.findByTestId("sdk-unsupported-react-version-error").should(
      "have.text",
      UNSUPPORTED_REACT_ERROR,
    );
    cy.findByTestId("data-app-content").should("not.exist");
  });
});

function AuthStatus() {
  const authStatus = useMetabaseAuthStatus();

  return <div data-testid="host-hook-value">{authStatus?.status}</div>;
}

function Metabot() {
  const metabot = useMetabot();

  return <div data-testid="host-hook-value">{metabot ? "ready" : "none"}</div>;
}

function assertUnsupportedReactErrorLoggedOnce() {
  cy.get<sinon.SinonSpy>("@consoleError").should((consoleError) => {
    const unsupportedReactErrors = consoleError.args.filter(
      ([message]) => message === UNSUPPORTED_REACT_ERROR,
    );

    expect(unsupportedReactErrors).to.have.length(1);
  });
}

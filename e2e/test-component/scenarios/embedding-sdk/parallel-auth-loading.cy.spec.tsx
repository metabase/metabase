import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  getSdkBundleScriptElement,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  AUTH_PROVIDER_URL,
  METABASE_INSTANCE_URL,
} from "e2e/support/helpers/embedding-sdk-helpers/constants";
import {
  getSignedJwtForUser,
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import { deleteConflictingCljsGlobals } from "metabase/embedding-sdk/test/delete-conflicting-cljs-globals";
import { defer } from "metabase/lib/promise";

const AUTH_STATE_KEY = "METABASE_EMBEDDING_SDK_AUTH_STATE";

const sdkCleanup = () => {
  getSdkBundleScriptElement()?.remove();
  delete (window as any).METABASE_EMBEDDING_SDK_BUNDLE;
  delete (window as any).METABASE_PROVIDER_PROPS_STORE;
  delete (window as any)[AUTH_STATE_KEY];
  deleteConflictingCljsGlobals();
};

function deferBundle() {
  const bundleDefer = defer();

  cy.intercept("GET", "/app/embedding-sdk.js", () => bundleDefer.promise).as(
    "bundleScript",
  );
  return bundleDefer;
}

describe("scenarios > embedding-sdk > parallel-auth-loading", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    cy.signOut();
    sdkCleanup();
    mockAuthProviderAndJwtSignIn();

    // the "first sso request"
    cy.intercept("GET", /\/auth\/sso(\?preferred_method=\w+)?$/).as(
      "authSsoDiscovery",
    );
    // the "token exchange"
    cy.intercept("GET", /\/auth\/sso\?.*jwt=/).as("authSsoTokenExchange");

    cy.intercept("GET", "/api/user/current").as("getCurrentUser");
    cy.intercept("GET", "/api/session/properties").as("getSessionProperties");
  });

  describe("When jwtProviderUri is provided", () => {
    it("should skip the first sso request and only call the token exchange", () => {
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
            preferredAuthMethod: "jwt",
            jwtProviderUri: AUTH_PROVIDER_URL,
          },
        },
      });

      // Verify question renders (auth worked)
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      // With jwtProviderUri: no discovery, only token exchange
      cy.get("@authSsoDiscovery.all").should("have.length", 0);
      cy.get("@authSsoTokenExchange.all").should("have.length", 1);
      cy.get("@getCurrentUser.all").should("have.length", 1);
      cy.get("@getSessionProperties.all").should("have.length", 1);
    });
  });

  describe("When jwtProviderUri is not provided", () => {
    it("should call the first sso request then the token exchange", () => {
      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
            // No jwtProviderUri - to trigger first sso request
          },
        },
      });

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByTestId("visualization-root").should("be.visible");
      });

      // Without jwtProviderUri: discovery + token exchange
      cy.get("@authSsoDiscovery.all").should("have.length", 1);
      cy.get("@authSsoTokenExchange.all").should("have.length", 1);
      cy.get("@getCurrentUser.all").should("have.length", 1);
      cy.get("@getSessionProperties.all").should("have.length", 1);
    });
  });

  describe("When package auth fails", () => {
    it("the bundle should retry the auth", () => {
      const bundleDefer = deferBundle();

      // Override the JWT provider mock to fail on first call, succeed on second
      let jwtCallCount = 0;
      cy.intercept("GET", `${AUTH_PROVIDER_URL}**`, async (req) => {
        jwtCallCount++;
        if (jwtCallCount === 1) {
          // First call fails (from package early auth)
          req.reply({
            statusCode: 500,
            body: { error: "Simulated failure" },
          });
          // After the failure, let the bundle load
          bundleDefer.resolve();
        } else {
          // Second call succeeds (from bundle retry)
          const jwt = await getSignedJwtForUser({});
          req.reply({
            statusCode: 200,
            body: { jwt },
          });
        }
      }).as("jwtProvider");

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
            preferredAuthMethod: "jwt",
            jwtProviderUri: AUTH_PROVIDER_URL,
          },
        },
      });

      // Should eventually render (after bundle retries)
      getSdkRoot().within(() => {
        cy.findByText("Orders", { timeout: 30000 }).should("exist");
      });

      // JWT provider should be called exactly twice (package fails, bundle succeeds)
      cy.get("@jwtProvider.all").should("have.length", 2);
      cy.get("@authSsoDiscovery.all").should("have.length", 0);
      cy.get("@authSsoTokenExchange.all").should("have.length", 1);
      cy.get("@getCurrentUser.all").should("have.length", 1);
      cy.get("@getSessionProperties.all").should("have.length", 1);
    });
  });

  describe("Backward compatibility: skipPackageAuth", () => {
    it("should let bundle handle auth when skipPackageAuth is true", () => {
      const bundleDefer = deferBundle();

      mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />, {
        sdkProviderProps: {
          authConfig: {
            metabaseInstanceUrl: METABASE_INSTANCE_URL,
            preferredAuthMethod: "jwt",
            jwtProviderUri: AUTH_PROVIDER_URL,
            skipPackageAuth: true,
          } as any,
        },
        waitForUser: false,
      });

      // Wait for auth state to be "skipped" (package decided not to do early auth)
      cy.window()
        .its(AUTH_STATE_KEY)
        .should("have.property", "status", "skipped")
        .then(() => {
          // At this point: package skipped auth, bundle is still delayed
          // Verify NO auth requests happened yet
          cy.get("@jwtProvider.all").should("have.length", 0);
          cy.get("@authSsoTokenExchange.all").should("have.length", 0);

          // Now release the bundle
          bundleDefer.resolve();
        });

      // Should render after bundle does auth
      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");
      });

      // Bundle does auth: discovery skipped (jwtProviderUri provided), token exchange happens
      cy.get("@authSsoDiscovery.all").should("have.length", 0);
      cy.get("@authSsoTokenExchange.all").should("have.length", 1);
      cy.get("@getCurrentUser.all").should("have.length", 1);
      cy.get("@getSessionProperties.all").should("have.length", 1);
    });
  });

  describe("Auth state coordination", () => {
    describe("when the bundle loads before the package auth finishes", () => {
      it("the bundle should wait for the package auth to finish", () => {
        const jwtProviderCallDefer = defer();

        // Hold JWT provider response until we manually resolve it
        cy.intercept("GET", `${AUTH_PROVIDER_URL}**`, async (req) => {
          await jwtProviderCallDefer.promise;
          const jwt = await getSignedJwtForUser({});
          req.reply({ statusCode: 200, body: { jwt } });
        }).as("jwtProvider");

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
            waitForUser: false,
          },
        );

        // Wait for bundle to load and verify it's waiting (not making duplicate requests)
        cy.window().should((win: any) => {
          expect(win.METABASE_EMBEDDING_SDK_BUNDLE).to.exist;
        });
        cy.get("@jwtProvider.all").should("have.length", 1);
        cy.get("@authSsoTokenExchange.all").should("have.length", 0);

        // Verify that the auth is really still in progress
        // it should _not_ already have rendered the question
        getSdkRoot().within(() => {
          cy.findByText("Orders").should("not.exist");
        });

        // Uncomment the following line to do manual testing
        // the auth should still be in progress, but the bundle should finish loading
        // cy.pause();

        // Now unblock the JWT request
        cy.then(() => jwtProviderCallDefer.resolve());

        // Question renders after auth completes
        getSdkRoot().findByText("Orders").should("exist");

        // Final check: only ONE set of requests (bundle waited, didn't duplicate)
        cy.get("@authSsoDiscovery.all").should("have.length", 0); // skipped as we have jwtProviderUri in the props
        cy.get("@jwtProvider.all").should("have.length", 1);
        cy.get("@authSsoTokenExchange.all").should("have.length", 1);
        cy.get("@getCurrentUser.all").should("have.length", 1);
        cy.get("@getSessionProperties.all").should("have.length", 1);
      });
    });

    describe("when the bundle loads after the package auth finishes", () => {
      it("the bundle should use the cached auth data", () => {
        const bundleDefer = deferBundle();

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
            waitForUser: false,
          },
        );

        cy.window().should((win: any) => {
          // wait for package auth to finish
          expect(win[AUTH_STATE_KEY].status).to.equal("completed");
        });

        // Uncomment the following line to do manual testing, the bundle should still be loading
        // cy.pause();

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("not.exist");
        });

        cy.then(() => bundleDefer.resolve());

        getSdkRoot().within(() => {
          cy.findByText("Orders").should("exist");
        });

        cy.get("@authSsoDiscovery.all").should("have.length", 0);
        cy.get("@authSsoTokenExchange.all").should("have.length", 1);
        cy.get("@getCurrentUser.all").should("have.length", 1);
        cy.get("@getSessionProperties.all").should("have.length", 1);
      });
    });
  });
});

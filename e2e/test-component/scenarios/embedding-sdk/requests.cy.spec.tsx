import {
  CollectionBrowser,
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";

import { USERS } from "e2e/support/cypress_data";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  DEFAULT_SDK_AUTH_PROVIDER_CONFIG,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import {
  getSignedJwtForUser,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { defer } from "metabase/lib/promise";

describe("scenarios > embedding-sdk > requests", () => {
  describe("cache preflight requests", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    it("caches preflight requests by setting Access-Control-Max-Age header", () => {
      cy.intercept("GET", "/api/user/current").as("getCurrentUser");

      mountSdkContent(<CollectionBrowser />);

      cy.wait("@getCurrentUser").then(({ response }) => {
        const maxAgeHeader = response?.headers["access-control-max-age"];

        expect(maxAgeHeader).to.equal("60");
      });
    });

    it("properly performs session token refresh request when multiple data requests are triggered at the same time", () => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      // Create two deferred promises to control when auth responses are sent
      // This allows us to simulate timing of token refresh in the test
      const deferreds = [defer(), defer()];
      let callCount = 0;

      // Create a JWT that expires in 60 seconds
      const expiredInSeconds = 60;
      cy.clock(Date.now());

      cy.then(() => getSignedJwtForUser({ expiredInSeconds })).then((jwt) => {
        // Mock the auth provider and use deferred responses
        mockAuthProviderAndJwtSignIn(USERS.admin, {
          jwt,
          deferredReply: () => deferreds[callCount++].promise,
        });
      });

      // Mount the component with the initial (valid) token
      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      // Resolve the first auth request to let the component load
      deferreds[0].resolve();

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");

        // Open the grouping dialog
        cy.findByText("Group").click();
        cy.findByRole("dialog").should("be.visible");

        // Fast-forward time past token expiration (65 seconds total)
        // This will invalidate the current JWT
        cy.tick(1000 * (expiredInSeconds + 5));

        // Trigger two data requests simultaneously by:
        // 1. Adding a grouping (ID column)
        // 2. Removing the grouping immediately
        cy.findByRole("dialog").contains(/^ID$/).click();
        cy.findByRole("dialog").findByTestId("badge-remove-button").click();

        // Verify that dataset requests are blocked while waiting for token refresh
        // No dataset requests should complete yet since the auth token is being refreshed
        cy.get("@dataset.all").should("have.length", 0);

        // Wait for the token refresh request, then allow it to complete
        cy.wait("@jwtProvider").then(() => {
          deferreds[1].resolve();
        });

        // After token refresh completes, both queued dataset requests should execute
        // This proves the SDK correctly batches requests during token refresh
        cy.get("@dataset.all").should("have.length", 2);
      });
    });
  });
});

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

    it.only("properly performs session token refresh request when multiple data requests are triggered at the same time", () => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      const deferreds = [defer(), defer()];
      let callCount = 0;

      const expiredInSeconds = 60;
      cy.clock(Date.now());

      cy.then(() => getSignedJwtForUser({ expiredInSeconds })).then((jwt) => {
        mockAuthProviderAndJwtSignIn(USERS.admin, {
          jwt,
          deferredReply: () => deferreds[callCount++].promise,
        });
      });

      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      deferreds[0].resolve();

      cy.then(() => {
        getSdkRoot().within(() => {
          cy.findByText("Orders", { timeout: 60_000 }).should("be.visible");

          cy.findByText("Group").click();

          cy.findByRole("dialog").should("be.visible");

          cy.tick(1000 * (expiredInSeconds + 5));

          cy.findByRole("dialog").contains(/^ID$/).click();
          cy.findByRole("dialog").findByTestId("badge-remove-button").click();

          // The requests should be done after we refresh the token, so where we should have 0
          cy.get("@dataset.all").should("have.length", 0);

          cy.wait("@jwtProvider").then(() => {
            deferreds[1].resolve();
          });

          // We ensure that both `dataset` requests are made after the token refresh request
          cy.get("@dataset.all", { timeout: 60_000 }).should("have.length", 2);
        });
      });
    });
  });
});

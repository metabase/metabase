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
import { defer } from "metabase/utils/promise";

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
      cy.clock(Date.now());

      cy.intercept("POST", "/api/dataset").as("dataset");

      const sessionIds: string[] = [];

      cy.intercept("POST", "/auth/sso", (req) => {
        req.continue((res) => {
          sessionIds.push(res.body.id);
        });
      }).as("jwtToSession");

      const expiredInSeconds = 60;

      const deferreds = [defer(), defer()];
      let index = 0;

      cy.then(() => getSignedJwtForUser({ expiredInSeconds })).then((jwt) => {
        mockAuthProviderAndJwtSignIn(USERS.admin, {
          jwt,
          waitForPromise: () => deferreds[index++].promise,
        });
      });

      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      cy.then(() => deferreds[0].resolve());

      getSdkRoot().within(() => {
        cy.findByText("Orders", { timeout: 60_000 }).should("exist");

        cy.findByText("Group").click();

        cy.findByRole("dialog").should("be.visible");

        cy.tick(1000 * (expiredInSeconds + 5));

        cy.findByRole("dialog").contains(/^ID$/).click();
        cy.findByText("Doing science...").should("exist");
        cy.findByRole("dialog").findByTestId("badge-remove-button").click();

        cy.get("@dataset.all").should("have.length", 0);

        cy.then(() => deferreds[1].resolve());

        cy.findByText("Product ID").should("be.visible");

        cy.wait("@jwtProvider");

        // Adding then removing the breakout triggers two queries while the token
        // is expired. They share a single token refresh (dedup); the earlier
        // query is superseded and dropped before dispatch, so only the latest
        // dataset request goes out — and it carries the refreshed session token.
        cy.get("@dataset.all", { timeout: 60_000 })
          .should("have.length", 1)
          .each((interception: any) => {
            expect(interception.request.headers["x-metabase-session"]).to.equal(
              sessionIds[1],
            );
          });

        // One `/auth/sso` at mount + one after expiry = 2 (deduped, not one
        // refresh per query).
        cy.get("@jwtToSession.all").should("have.length", 2);
      });
    });
  });
});

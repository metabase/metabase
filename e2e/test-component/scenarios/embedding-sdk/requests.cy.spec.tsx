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
      const expiredInSeconds = 60;
      cy.clock(Date.now());

      cy.then(() => getSignedJwtForUser({ expiredInSeconds })).then((jwt) => {
        mockAuthProviderAndJwtSignIn(USERS.admin, { jwt });
      });

      cy.mount(
        <MetabaseProvider authConfig={DEFAULT_SDK_AUTH_PROVIDER_CONFIG}>
          <InteractiveQuestion questionId={ORDERS_QUESTION_ID} />
        </MetabaseProvider>,
      );

      getSdkRoot().within(() => {
        cy.findByText("Orders").should("exist");

        cy.findByText("Group").click();

        cy.findByRole("dialog").should("be.visible");

        cy.tick(1000 * (expiredInSeconds + 5));

        cy.findByRole("dialog").contains(/^ID$/).click();
        cy.findByRole("dialog").findByTestId("badge-remove-button").click();

        cy.wait("@jwtProvider");

        cy.intercept("POST", "/api/dataset").as("dataset");
        // We ensure that both `dataset` requests are made after the token refresh request
        cy.get("@dataset.all").should("have.length", 2);

        cy.clock().then((clock) => clock.restore());
      });
    });
  });
});

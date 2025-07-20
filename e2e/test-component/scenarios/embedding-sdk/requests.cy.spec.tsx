import { CollectionBrowser } from "@metabase/embedding-sdk-react";

import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
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
  });
});

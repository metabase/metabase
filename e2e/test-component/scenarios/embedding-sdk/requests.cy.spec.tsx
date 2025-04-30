import { CollectionBrowser } from "@metabase/embedding-sdk-react";

import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/component-testing-sdk";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
} from "e2e/support/helpers/component-testing-sdk/component-embedding-sdk-helpers";

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

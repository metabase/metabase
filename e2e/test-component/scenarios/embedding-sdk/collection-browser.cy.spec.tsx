import { CollectionBrowser } from "@metabase/embedding-sdk-react";

import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/component-testing-sdk";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
} from "e2e/support/helpers/component-testing-sdk/component-embedding-sdk-helpers";

describe("scenarios > embedding-sdk > collection browser", () => {
  describe("personal collection", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.intercept("GET", "/api/collection/*").as("getCollection");
    });

    ["personal", undefined].forEach(collectionId => {
      it(`should show the personal collection when collectionId is ${collectionId ? collectionId : "not passed"}`, () => {
        let personalCollectionId: number;

        cy.intercept("GET", "/api/user/current", req => {
          req.continue(res => {
            personalCollectionId = res.body.personal_collection_id;
          });
        }).as("getCurrentUser");

        mountSdkContent(
          <CollectionBrowser {...(collectionId ? { collectionId } : {})} />,
        );

        cy.wait("@getCollection").then(interception => {
          expect(interception.request.url).to.include(
            `/api/collection/${personalCollectionId}`,
          );
        });
      });
    });

    it("should use the root collection if collectionId is 'root'", () => {
      mountSdkContent(<CollectionBrowser collectionId="root" />);

      cy.wait("@getCollection").then(interception => {
        expect(interception.request.url).to.include("/api/collection/root");
      });
    });
  });
});

import { CollectionBrowser } from "@metabase/embedding-sdk-react";

import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/component-testing-sdk";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
} from "e2e/support/helpers/component-testing-sdk/component-embedding-sdk-helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

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

        getSdkRoot()
          .findByText("Bobby Tables's Personal Collection")
          .should("exist");
      });
    });

    it("should use the root collection if collectionId is 'root'", () => {
      mountSdkContent(<CollectionBrowser collectionId="root" />);

      cy.wait("@getCollection").then(interception => {
        expect(interception.request.url).to.include("/api/collection/root");
      });
    });
  });

  describe("root collection", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    it("should load the root collection if collectionId='root'", () => {
      cy.intercept("GET", "/api/collection/root").as("getRootCollection");

      mountSdkContent(<CollectionBrowser collectionId="root" />);

      cy.wait("@getRootCollection");

      getSdkRoot().findByText("Our analytics").should("exist");
    });
  });
});

import { CollectionBrowser } from "@metabase/embedding-sdk-react";
import { useState } from "react";

import {
  FIRST_COLLECTION_ENTITY_ID,
  SECOND_COLLECTION_ENTITY_ID,
} from "e2e/support/cypress_sample_instance_data";
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

    ["personal", undefined].forEach((collectionId) => {
      it(`should show the personal collection when collectionId is ${collectionId ? collectionId : "not passed"}`, () => {
        cy.intercept("GET", "/api/user/current").as("getCurrentUser");

        mountSdkContent(
          <CollectionBrowser {...(collectionId ? { collectionId } : {})} />,
        );

        cy.wait("@getCurrentUser").then(({ response }) => {
          const personalCollectionId = response?.body.personal_collection_id;

          cy.wait("@getCollection").then((collectionInterception) => {
            expect(collectionInterception.request.url).to.include(
              `/api/collection/${personalCollectionId}`,
            );
          });
        });

        getSdkRoot()
          .findByText("Bobby Tables's Personal Collection")
          .should("exist");
      });
    });

    it("should use the root collection if collectionId is 'root'", () => {
      mountSdkContent(<CollectionBrowser collectionId="root" />);

      cy.wait("@getCollection").then((interception) => {
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

  describe("collection using entity ids", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    it("can change collection to a different entity id without crashing (metabase#57438)", () => {
      const TestComponent = () => {
        const [collectionId, setCollectionId] = useState<string | null>(
          FIRST_COLLECTION_ENTITY_ID!,
        );

        return (
          <div>
            <div>id = {collectionId}</div>
            <CollectionBrowser collectionId={collectionId} />

            <div onClick={() => setCollectionId(SECOND_COLLECTION_ENTITY_ID!)}>
              use second collection
            </div>
          </div>
        );
      };

      cy.intercept("GET", "/api/collection/*").as("getCollection");

      mountSdkContent(<TestComponent />);

      getSdkRoot().within(() => {
        cy.findByText(`id = ${FIRST_COLLECTION_ENTITY_ID}`).should("exist");
        cy.findByText("Our analytics").should("not.exist");
        cy.findByText("Second collection").should("not.exist");
        cy.findByText("First collection").should("exist");

        cy.findByText("use second collection").click();

        cy.log("ensure that the collection id is updated and does not crash");
        cy.findByText(`id = ${SECOND_COLLECTION_ENTITY_ID}`).should("exist");
        cy.findByText("First collection").should("not.exist");
        cy.findByText("Second collection").should("exist");
      });
    });
  });
});

const { H } = cy;
import { CollectionBrowser } from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { USERS } from "e2e/support/cypress_data";
import {
  DATA_GROUP_ID,
  FIRST_COLLECTION_ENTITY_ID,
  SECOND_COLLECTION_ENTITY_ID,
} from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { CollectionPermission } from "metabase-types/api";

const READ: CollectionPermission = "read";
const NONE: CollectionPermission = "none";

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

    it("should be able to move resources to trash (EMB-892)", () => {
      mountSdkContent(<CollectionBrowser collectionId="root" />);

      const dashboardName = "Orders in a dashboard";

      getSdkRoot().within(() => {
        cy.findByText("Our analytics").should("exist");
        cy.findByText("Orders in a dashboard").should("exist");

        cy.log("move the dashboard to trash");
        cy.findByText(dashboardName).closest("tr").button("Actions").click();
      });

      H.popover().findByRole("menuitem", { name: "Move to trash" }).click();

      cy.log("the deleted dashboard should be gone");
      getSdkRoot().findByText(dashboardName).should("not.exist");
    });
  });

  describe('collectionId="all"', () => {
    const SHARED_TENANT_NAMESPACE = "shared-tenant-collection";

    const TENANT = { name: "Acme", slug: "acme" };

    const TENANT_USER = {
      first_name: "Tina",
      last_name: "Tenanton",
      email: "tenant@metabase.test",
      "@tenant": TENANT.slug,
    };

    const createSharedCollection = (name: string, parentId?: number) =>
      cy.request("POST", "/api/collection", {
        name,
        namespace: SHARED_TENANT_NAMESPACE,
        parent_id: parentId ?? null,
      });

    const setUpTenantsInstance = () => {
      signInAsAdminAndEnableEmbeddingSdk();
      H.updateSetting("use-tenants", true);

      createSharedCollection("Shared Reports").then(({ body: collection }) => {
        createSharedCollection("Shared Sub-Collection", collection.id);
      });
    };

    describe("for a normal user", () => {
      beforeEach(() => {
        signInAsAdminAndEnableEmbeddingSdk();

        cy.signOut();
        mockAuthProviderAndJwtSignIn(USERS.normal);
      });

      it("should list the reachable roots, drill into one and come back", () => {
        mountSdkContent(<CollectionBrowser collectionId="all" />);

        getSdkRoot().within(() => {
          cy.log("the personal collection sits beside `Our analytics`");
          cy.findByTestId("all-collections-list").within(() => {
            cy.findByText("Our analytics").should("exist");
            cy.findByText("Your personal collection").should("exist");
          });

          cy.log("`Our analytics` opens and shows its contents");
          cy.findByText("Our analytics").click();
          // wait for the navigation out of the virtual root
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByText("Orders in a dashboard").should("exist");

          cy.log("the `All collections` crumb returns to the virtual root");
          cy.findByText("All collections").click();
          cy.findByTestId("all-collections-list")
            .findByText("Your personal collection")
            .click();

          cy.log("the personal collection does not sit under `Our analytics`");
          cy.findByText("Robert Tableton's Personal Collection").should(
            "exist",
          );
          cy.findByText("Our analytics").should("not.exist");
        });
      });
    });

    describe("for a tenant user", () => {
      beforeEach(() => {
        setUpTenantsInstance();

        cy.request("PUT", "/api/setting", {
          "jwt-user-provisioning-enabled?": true,
        });
        cy.request("POST", "/api/ee/tenant", TENANT);

        cy.signOut();

        cy.task<string>("signJwt", {
          payload: {
            ...TENANT_USER,
            exp: Math.round(Date.now() / 1000) + 10 * 60,
          },
          secret: JWT_SHARED_SECRET,
        }).then((jwt) => mockAuthProviderAndJwtSignIn(undefined, { jwt }));
      });

      it("should list Our data and the shared tenant collections, and drill into them", () => {
        mountSdkContent(<CollectionBrowser collectionId="all" />);

        getSdkRoot().within(() => {
          cy.log("the tenant collection shows up as `Our data`");
          cy.findByTestId("all-collections-list").within(() => {
            cy.findByText("Shared Reports").should("exist");
            cy.findByText("Our data").should("exist");
            cy.findByText("Your personal collection").should("exist");
          });

          cy.log("the shallow tree lists only the top level, not the children");
          cy.findByText("Shared Sub-Collection").should("not.exist");

          cy.log("a shared tenant collection opens like any other row");
          cy.findByText("Shared Reports").click();
          // wait for the navigation out of the virtual root
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByText("Shared Sub-Collection").should("exist");
          cy.findByText("Our analytics").should("not.exist");

          cy.log("`Our data` opens the same way");
          cy.findByText("All collections").click();
          cy.findByTestId("all-collections-list")
            .findByText("Our data")
            .click();
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByText("All collections").should("exist");
          cy.findByText("Our analytics").should("not.exist");
        });
      });
    });

    describe("for a user with no access to the root", () => {
      beforeEach(() => {
        signInAsAdminAndEnableEmbeddingSdk();

        H.createCollection({ name: "Accessible Collection" }).then(
          ({ body: collection }) => {
            H.createDashboard({
              name: "Accessible Dashboard",
              collection_id: collection.id,
            });

            cy.updateCollectionGraph({
              [DATA_GROUP_ID]: { root: NONE, [collection.id]: READ },
            });
          },
        );

        cy.signOut();
        mockAuthProviderAndJwtSignIn(USERS.nocollection);
      });

      it("should promote the collections below the root, drill into one and come back", () => {
        mountSdkContent(<CollectionBrowser collectionId="all" />);

        getSdkRoot().within(() => {
          cy.log("the reachable collections replace `Our analytics`, no error");
          cy.findByTestId("all-collections-list").within(() => {
            cy.findByText("Accessible Collection").should("exist");
            cy.findByText("Your personal collection").should("exist");
          });
          cy.findByText("Our analytics").should("not.exist");
          cy.findByText("You don't have access to this collection").should(
            "not.exist",
          );

          cy.log("drilling in shows the contents, with no unreachable crumb");
          cy.findByText("Accessible Collection").click();
          // wait for the navigation out of the virtual root
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByText("Accessible Dashboard").should("exist");
          cy.findByText("Our analytics").should("not.exist");

          cy.log("the `All collections` crumb returns to the virtual root");
          cy.findByText("All collections").click();
          cy.findByTestId("all-collections-list")
            .findByText("Accessible Collection")
            .should("exist");
        });
      });
    });
  });

  describe("collection using entity ids", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
    });

    it("does not contain parent collection in breadcrumb (EMB-596)", () => {
      cy.intercept("GET", "/api/collection/*").as("getCollection");

      mountSdkContent(
        <CollectionBrowser collectionId={SECOND_COLLECTION_ENTITY_ID} />,
      );

      getSdkRoot().within(() => {
        cy.findByText("Second collection").should("exist");
        cy.findByText("First collection").should("not.exist");
      });
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

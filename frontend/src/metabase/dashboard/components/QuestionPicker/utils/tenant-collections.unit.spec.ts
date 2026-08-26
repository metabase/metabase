import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import getExpandedCollectionsById from "metabase/common/collections/getExpandedCollectionsById";
import type { Collection, CollectionId } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  COLLECTIONS_TOP_LEVEL_ID,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
} from "./tenant-collection-tree";
import {
  mergeTenantCollections,
  mergeTenantUserCollections,
} from "./tenant-collections";

const expandCollections = (
  collections: Collection[] = [],
  personalCollectionId: CollectionId | null = null,
) => getExpandedCollectionsById(collections, personalCollectionId);

describe("mergeTenantCollections", () => {
  it("adds synthetic tenant collections below the root namespace", () => {
    const tenantCollection = createMockCollection({
      id: 100,
      name: "Tenant collection: Acme",
      location: "/",
      namespace: "tenant-specific",
    });

    const sharedCollection = createMockCollection({
      id: 101,
      name: "Finance",
      location: "/",
      namespace: "shared-tenant-collection",
    });

    const collectionsById = mergeTenantCollections({
      baseCollectionsById: expandCollections(),
      sharedCollectionsById: expandCollections([sharedCollection]),
      tenantSpecificCollectionsById: expandCollections([tenantCollection]),
      sharedCollectionsName: "Shared collections",
      tenantCollectionNamesById: new Map([[tenantCollection.id, "Acme"]]),
    });

    expect(
      collectionsById[COLLECTIONS_TOP_LEVEL_ID].children.map(({ id }) => id),
    ).toEqual([
      ROOT_COLLECTION.id,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
    ]);

    expect(collectionsById[SHARED_TENANT_COLLECTIONS_ROOT_ID].name).toBe(
      "Shared collections",
    );

    expect(collectionsById[TENANT_SPECIFIC_COLLECTIONS_ROOT_ID].name).toBe(
      "Tenant collections",
    );

    expect(collectionsById[tenantCollection.id].name).toBe("Acme");
  });
});

describe("mergeTenantUserCollections", () => {
  it("flattens personal collections when Our analytics is not readable", () => {
    const tenantCollection = createMockCollection({
      id: 100,
      name: "Tenant collection: Acme",
      location: "/",
      namespace: "tenant-specific",
    });

    const sharedCollections = ["Finance", "Marketing"].map((name, index) =>
      createMockCollection({
        id: 101 + index,
        name,
        location: "/",
        namespace: "shared-tenant-collection",
      }),
    );

    const personalCollection = createMockCollection({
      id: 103,
      name: "Poom's personal collection",
      location: "/",
      personal_owner_id: 1,
    });

    const collectionsById = mergeTenantUserCollections({
      baseCollectionsById: expandCollections(
        [personalCollection],
        personalCollection.id,
      ),
      sharedCollectionsById: expandCollections(sharedCollections),
      tenantSpecificCollectionsById: expandCollections([tenantCollection]),
      canReadRootCollection: false,
    });

    expect(
      collectionsById[COLLECTIONS_TOP_LEVEL_ID].children.map(
        ({ name }) => name,
      ),
    ).toEqual(["Our data", "Finance", "Marketing", "My personal collection"]);

    expect(collectionsById).not.toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );

    expect(collectionsById).not.toHaveProperty(
      String(TENANT_SPECIFIC_COLLECTIONS_ROOT_ID),
    );
  });

  it("keeps readable Our analytics when it has no subcollections", () => {
    const ourAnalytics = createMockCollection({ ...ROOT_COLLECTION });

    const collectionsById = mergeTenantUserCollections({
      baseCollectionsById: expandCollections([ourAnalytics]),
      sharedCollectionsById: expandCollections(),
      tenantSpecificCollectionsById: expandCollections(),
      canReadRootCollection: true,
    });

    expect(
      collectionsById[COLLECTIONS_TOP_LEVEL_ID].children.map(
        ({ name }) => name,
      ),
    ).toEqual(["Our analytics"]);
  });
});

import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { ExpandedCollection } from "metabase/redux/store";
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

const createMockExpandedCollection = (
  overrides: Partial<Collection> & { path?: CollectionId[] | null },
): ExpandedCollection => ({
  ...createMockCollection(overrides),
  path: overrides.path ?? [],
  parent: null,
  children: [],
  is_personal: false,
});

describe("mergeTenantCollections", () => {
  it("adds synthetic tenant collections below the root namespace", () => {
    const syntheticRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      name: "Collections",
      path: [],
    });

    const ourAnalytics = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      path: [],
    });

    const tenantCollection = createMockExpandedCollection({
      id: 100,
      name: "Acme",
      location: "/",
      path: [ROOT_COLLECTION.id],
      namespace: "tenant-specific",
    });

    const tenantSpecificRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      name: "Collections",
      path: [],
    });

    const sharedCollection = createMockExpandedCollection({
      id: 101,
      name: "Finance",
      location: "/",
      path: [ROOT_COLLECTION.id],
      namespace: "shared-tenant-collection",
    });

    tenantSpecificRoot.children = [tenantCollection];
    tenantCollection.parent = tenantSpecificRoot;
    syntheticRoot.children = [sharedCollection];
    sharedCollection.parent = syntheticRoot;

    const collectionsById = mergeTenantCollections({
      baseCollectionsById: { [ROOT_COLLECTION.id]: ourAnalytics },
      sharedCollectionsById: {
        [ROOT_COLLECTION.id]: syntheticRoot,
        [sharedCollection.id]: sharedCollection,
      },
      tenantSpecificCollectionsById: {
        [ROOT_COLLECTION.id]: tenantSpecificRoot,
        [tenantCollection.id]: tenantCollection,
      },
      sharedCollectionsName: "Shared collections",
      tenantCollectionNamesById: new Map([[tenantCollection.id, "Acme"]]),
    });

    const topLevel = collectionsById[COLLECTIONS_TOP_LEVEL_ID];
    const sharedRootNode = collectionsById[SHARED_TENANT_COLLECTIONS_ROOT_ID];
    const tenantRootNode = collectionsById[TENANT_SPECIFIC_COLLECTIONS_ROOT_ID];
    const mergedTenantCollection = collectionsById[tenantCollection.id];

    expect(topLevel.children.map((collection) => collection.id)).toEqual([
      ROOT_COLLECTION.id,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
    ]);

    expect(sharedRootNode.name).toBe("Shared collections");
    expect(tenantRootNode.name).toBe("Tenant collections");
    expect(mergedTenantCollection.name).toBe("Acme");
    expect(mergedTenantCollection.parent).toBe(tenantRootNode);
  });
});

describe("mergeTenantUserCollections", () => {
  it("shows Our data and shared collections directly beneath Collections", () => {
    const syntheticRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      path: [],
    });

    const ourAnalytics = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      path: [],
    });

    const tenantCollection = createMockExpandedCollection({
      id: 100,
      name: "Tenant collection: Acme",
      location: "/",
      path: [ROOT_COLLECTION.id],
      namespace: "tenant-specific",
    });

    const tenantSpecificRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      path: [],
    });

    const sharedCollectionA = createMockExpandedCollection({
      id: 101,
      name: "Finance",
      location: "/",
      path: [ROOT_COLLECTION.id],
      namespace: "shared-tenant-collection",
    });

    const sharedCollectionB = createMockExpandedCollection({
      id: 102,
      name: "Marketing",
      location: "/",
      path: [ROOT_COLLECTION.id],
      namespace: "shared-tenant-collection",
    });

    tenantSpecificRoot.children = [tenantCollection];
    tenantCollection.parent = tenantSpecificRoot;
    syntheticRoot.children = [sharedCollectionA, sharedCollectionB];
    sharedCollectionA.parent = syntheticRoot;
    sharedCollectionB.parent = syntheticRoot;

    const collectionsById = mergeTenantUserCollections({
      baseCollectionsById: { [ROOT_COLLECTION.id]: ourAnalytics },
      sharedCollectionsById: {
        [ROOT_COLLECTION.id]: syntheticRoot,
        [sharedCollectionA.id]: sharedCollectionA,
        [sharedCollectionB.id]: sharedCollectionB,
      },
      tenantSpecificCollectionsById: {
        [ROOT_COLLECTION.id]: tenantSpecificRoot,
        [tenantCollection.id]: tenantCollection,
      },
    });

    const topLevel = collectionsById[COLLECTIONS_TOP_LEVEL_ID];

    expect(topLevel.children.map(({ name }) => name)).toEqual([
      "Our data",
      "Finance",
      "Marketing",
    ]);

    expect(collectionsById).not.toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );

    expect(collectionsById).not.toHaveProperty(
      String(TENANT_SPECIFIC_COLLECTIONS_ROOT_ID),
    );

    expect(collectionsById[tenantCollection.id].parent).toBe(topLevel);
    expect(collectionsById[tenantCollection.id].path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
    ]);
  });
});

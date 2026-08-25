import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { ExpandedCollection } from "metabase/redux/store";
import type { Collection, CollectionId } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  COLLECTIONS_TOP_LEVEL_ID,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  createSyntheticTopLevel,
  flattenCollectionTree,
  mergeBaseCollectionsAtTopLevel,
  mergeCollectionNamespaceChildren,
} from "./tenant-collection-tree";

const createMockExpandedCollection = (
  overrides: Partial<Collection> & { path?: CollectionId[] | null },
): ExpandedCollection => ({
  ...createMockCollection(overrides),
  path: overrides.path ?? [],
  parent: null,
  children: [],
  is_personal: false,
});

describe("mergeBaseCollectionsAtTopLevel", () => {
  it("adds Collections to base collection paths", () => {
    const baseRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      path: [],
    });

    const subCollection = createMockExpandedCollection({
      id: 200,
      name: "Our Analytics Sub",
      location: "/",
      path: [ROOT_COLLECTION.id],
    });

    const nestedCollection = createMockExpandedCollection({
      id: 201,
      name: "Nested Sub",
      location: "/200/",
      path: [ROOT_COLLECTION.id, subCollection.id],
    });

    const syntheticTopLevel = createSyntheticTopLevel();
    const mergedCollectionsById: Record<CollectionId, ExpandedCollection> = {};

    baseRoot.children = [subCollection];
    subCollection.parent = baseRoot;
    subCollection.children = [nestedCollection];
    nestedCollection.parent = subCollection;

    const mergedRoot = mergeBaseCollectionsAtTopLevel({
      baseCollectionsById: {
        [ROOT_COLLECTION.id]: baseRoot,
        [subCollection.id]: subCollection,
        [nestedCollection.id]: nestedCollection,
      },
      mergedCollectionsById,
      syntheticTopLevel,
    });

    expect(mergedRoot?.parent).toBe(syntheticTopLevel);
    expect(mergedRoot?.path).toEqual([COLLECTIONS_TOP_LEVEL_ID]);

    expect(mergedCollectionsById[subCollection.id].path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      ROOT_COLLECTION.id,
    ]);

    expect(mergedCollectionsById[nestedCollection.id].path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      ROOT_COLLECTION.id,
      subCollection.id,
    ]);
  });
});

describe("mergeCollectionNamespaceChildren", () => {
  it("reparents namespace collections and rewrites their paths", () => {
    const syntheticTopLevel = createSyntheticTopLevel();

    const namespaceRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      path: [],
    });

    const tenantCollection = createMockExpandedCollection({
      id: 100,
      name: "Tenant A",
      location: "/",
      path: [ROOT_COLLECTION.id],
    });

    const subCollection = createMockExpandedCollection({
      id: 300,
      name: "Subcollection",
      location: "/100/",
      path: [ROOT_COLLECTION.id, tenantCollection.id],
    });

    const syntheticRoot: ExpandedCollection = {
      ...syntheticTopLevel,
      id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
      name: "Shared collections",
      parent: syntheticTopLevel,
      path: [COLLECTIONS_TOP_LEVEL_ID],
    };

    const collectionsById: Record<CollectionId, ExpandedCollection> = {};

    namespaceRoot.children = [tenantCollection];
    tenantCollection.parent = namespaceRoot;
    tenantCollection.children = [subCollection];
    subCollection.parent = tenantCollection;

    const directCollections = mergeCollectionNamespaceChildren({
      collectionsById,
      namespaceCollectionsById: {
        [ROOT_COLLECTION.id]: namespaceRoot,
        [tenantCollection.id]: tenantCollection,
        [subCollection.id]: subCollection,
      },
      parent: syntheticRoot,
      pathPrefix: [COLLECTIONS_TOP_LEVEL_ID, SHARED_TENANT_COLLECTIONS_ROOT_ID],
    });

    const mergedTenantCollection = collectionsById[tenantCollection.id];
    const mergedSubCollection = collectionsById[subCollection.id];

    expect(directCollections).toEqual([mergedTenantCollection]);
    expect(mergedTenantCollection.parent).toBe(syntheticRoot);

    expect(mergedTenantCollection.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
    ]);

    expect(mergedSubCollection.parent).toBe(mergedTenantCollection);
    expect(mergedSubCollection.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      tenantCollection.id,
    ]);
  });
});

describe("flattenCollectionTree", () => {
  it("flattens nested collections", () => {
    const tenantCollection = createMockCollection({
      id: 100,
      name: "Acme",
      children: [
        createMockCollection({
          id: 101,
          name: "Tenant questions",
          children: [],
        }),
      ],
    });

    expect(
      flattenCollectionTree([tenantCollection]).map(({ id }) => id),
    ).toEqual([100, 101]);
  });
});

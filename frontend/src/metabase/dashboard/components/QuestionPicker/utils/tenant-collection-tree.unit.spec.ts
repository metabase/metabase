import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import getExpandedCollectionsById from "metabase/common/collections/getExpandedCollectionsById";
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

const expandCollections = (collections: Collection[] = []) =>
  getExpandedCollectionsById(collections, null);

describe("mergeBaseCollectionsAtTopLevel", () => {
  it("adds Collections to base collection paths", () => {
    const subCollection = createMockCollection({
      id: 200,
      name: "Our Analytics Sub",
      location: "/",
    });

    const nestedCollection = createMockCollection({
      id: 201,
      name: "Nested Sub",
      location: "/200/",
    });

    const syntheticTopLevel = createSyntheticTopLevel();
    const mergedCollectionsById: Record<CollectionId, ExpandedCollection> = {};

    const mergedRoot = mergeBaseCollectionsAtTopLevel({
      baseCollectionsById: expandCollections([subCollection, nestedCollection]),
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
      String(subCollection.id),
    ]);
  });
});

describe("mergeCollectionNamespaceChildren", () => {
  it("reparents namespace collections and rewrites their paths", () => {
    const tenantCollection = createMockCollection({
      id: 100,
      name: "Tenant A",
      location: "/",
    });

    const subCollection = createMockCollection({
      id: 300,
      name: "Subcollection",
      location: "/100/",
    });

    const syntheticTopLevel = createSyntheticTopLevel();

    const syntheticCollection: ExpandedCollection = {
      ...syntheticTopLevel,
      id: SHARED_TENANT_COLLECTIONS_ROOT_ID,
      name: "Shared collections",
      parent: syntheticTopLevel,
      path: [COLLECTIONS_TOP_LEVEL_ID],
    };

    const collectionsById: Record<CollectionId, ExpandedCollection> = {};

    mergeCollectionNamespaceChildren({
      collectionsById,
      namespaceCollectionsById: expandCollections([
        tenantCollection,
        subCollection,
      ]),
      parent: syntheticCollection,
      pathPrefix: [COLLECTIONS_TOP_LEVEL_ID, syntheticCollection.id],
    });

    const mergedTenantCollection = collectionsById[tenantCollection.id];
    const mergedSubCollection = collectionsById[subCollection.id];

    expect(mergedTenantCollection.parent).toBe(syntheticCollection);

    expect(mergedTenantCollection.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
    ]);

    expect(mergedSubCollection.parent).toBe(mergedTenantCollection);

    expect(mergedSubCollection.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      String(tenantCollection.id),
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

import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { Collection, CollectionId } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  COLLECTIONS_TOP_LEVEL_ID,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  mergeSharedCollections,
} from "./use-collections-with-tenants";

const createMockExpandedCollection = (
  overrides: Partial<Collection> & { path?: CollectionId[] | null },
): Collection & {
  parent: Collection | null;
  path: CollectionId[];
  children: Collection[];
} => ({
  ...createMockCollection(overrides),
  path: overrides.path ?? [],
  parent: null,
  children: [],
  is_personal: false,
});

function setup() {
  const baseRoot = createMockExpandedCollection({
    ...ROOT_COLLECTION,
    path: [],
  });

  const ourAnalyticsSubCollection = createMockExpandedCollection({
    id: 200 as CollectionId,
    name: "Our Analytics Sub",
    location: "/",
    path: ["root" as CollectionId],
  });

  const ourAnalyticsNestedCollection = createMockExpandedCollection({
    id: 201 as CollectionId,
    name: "Nested Sub",
    location: "/200/",
    path: ["root" as CollectionId, 200 as CollectionId],
  });

  baseRoot.children = [ourAnalyticsSubCollection];
  ourAnalyticsSubCollection.parent = baseRoot;
  ourAnalyticsSubCollection.children = [ourAnalyticsNestedCollection];
  ourAnalyticsNestedCollection.parent = ourAnalyticsSubCollection;

  const baseCollectionsById = {
    [ROOT_COLLECTION.id]: baseRoot,
    [200 as CollectionId]: ourAnalyticsSubCollection,
    [201 as CollectionId]: ourAnalyticsNestedCollection,
  } as Record<CollectionId, Collection>;

  const sharedRoot = createMockExpandedCollection({
    ...ROOT_COLLECTION,
    path: [],
  });

  const tenantA = createMockExpandedCollection({
    id: 100 as CollectionId,
    name: "Tenant A",
    location: "/",
    path: ["root" as CollectionId],
  });

  const subCollection = createMockExpandedCollection({
    id: 300 as CollectionId,
    name: "Subcollection",
    location: "/100/",
    path: ["root" as CollectionId, 100 as CollectionId],
  });

  sharedRoot.children = [tenantA];
  tenantA.parent = sharedRoot;
  tenantA.children = [subCollection];
  subCollection.parent = tenantA;

  return mergeSharedCollections(
    baseCollectionsById,
    {
      [ROOT_COLLECTION.id]: sharedRoot,
      [100 as CollectionId]: tenantA,
      [300 as CollectionId]: subCollection,
    },
    "Shared collections",
  );
}

describe("mergeSharedCollections", () => {
  it("should create a top-level Collections node with Our analytics and Shared collections as siblings", () => {
    const result = setup() as any;

    const topLevel = result[COLLECTIONS_TOP_LEVEL_ID];
    expect(topLevel.name).toBe("Collections");
    expect(topLevel.parent).toBeNull();
    expect(topLevel.children).toHaveLength(2);
    expect(topLevel.children[0].id).toBe(ROOT_COLLECTION.id);
    expect(topLevel.children[1].id).toBe(SHARED_TENANT_COLLECTIONS_ROOT_ID);

    const root = result[ROOT_COLLECTION.id];
    expect(root.parent.id).toBe(COLLECTIONS_TOP_LEVEL_ID);
    expect(root.path).toEqual([COLLECTIONS_TOP_LEVEL_ID]);

    const syntheticRoot = result[SHARED_TENANT_COLLECTIONS_ROOT_ID];
    expect(syntheticRoot.name).toBe("Shared collections");
    expect(syntheticRoot.parent.id).toBe(COLLECTIONS_TOP_LEVEL_ID);
    expect(syntheticRoot.path).toEqual([COLLECTIONS_TOP_LEVEL_ID]);
  });

  it("should rewrite paths for Our Analytics sub-collections to include the top-level Collections node", () => {
    const result = setup() as any;

    const sub = result[200 as CollectionId];
    expect(sub.path).toEqual([COLLECTIONS_TOP_LEVEL_ID, "root"]);

    const nested = result[201 as CollectionId];
    expect(nested.path).toEqual([COLLECTIONS_TOP_LEVEL_ID, "root", 200]);
  });

  it("should re-parent children and rewrite paths through the top-level and synthetic root", () => {
    const result = setup() as any;

    const tenantA = result[100 as CollectionId];
    expect(tenantA.parent.id).toBe(SHARED_TENANT_COLLECTIONS_ROOT_ID);
    expect(tenantA.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
    ]);

    const subcollection = result[300 as CollectionId];
    expect(subcollection.parent.id).toBe(100);
    expect(subcollection.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      100,
    ]);
  });
});

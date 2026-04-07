import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { Collection, CollectionId } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import {
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

  const baseCollectionsById = {
    [ROOT_COLLECTION.id]: baseRoot,
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
  it("should insert a synthetic shared root under Our analytics", () => {
    const result = setup() as any;

    const syntheticRoot = result[SHARED_TENANT_COLLECTIONS_ROOT_ID];
    expect(syntheticRoot.name).toBe("Shared collections");
    expect(syntheticRoot.parent.id).toBe(ROOT_COLLECTION.id);

    const rootChildren = result[ROOT_COLLECTION.id].children;
    expect(rootChildren).toContainEqual(
      expect.objectContaining({ id: SHARED_TENANT_COLLECTIONS_ROOT_ID }),
    );
  });

  it("should re-parent children and rewrite paths through the synthetic root", () => {
    const result = setup() as any;

    const tenantA = result[100 as CollectionId];
    expect(tenantA.parent.id).toBe(SHARED_TENANT_COLLECTIONS_ROOT_ID);
    expect(tenantA.path).toEqual([
      ROOT_COLLECTION.id,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
    ]);

    const subcollection = result[300 as CollectionId];
    expect(subcollection.parent.id).toBe(100);
    expect(subcollection.path).toEqual([
      ROOT_COLLECTION.id,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      100,
    ]);
  });
});

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCollectionTreeEndpoint } from "__support__/server-mocks/collection";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { createMockState } from "metabase/redux/store/mocks";
import type { Collection, CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  COLLECTIONS_TOP_LEVEL_ID,
  type ExpandedCollectionNode,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  mergeSharedCollections,
  useCollectionsWithTenants,
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

function setupHook({
  useTenants = false,
  sharedCollections = [] as Collection[],
} = {}) {
  setupCollectionTreeEndpoint(sharedCollections);

  const baseRoot = createMockExpandedCollection({
    ...ROOT_COLLECTION,
    path: [],
  });

  const collectionsById = {
    [ROOT_COLLECTION.id]: baseRoot,
  } as Record<CollectionId, Collection>;

  return renderHookWithProviders(
    () => useCollectionsWithTenants(collectionsById),
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "use-tenants": useTenants,
          "token-features": createMockTokenFeatures({ tenants: true }),
        }),
      }),
    },
  );
}

describe("useCollectionsWithTenants", () => {
  beforeAll(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ tenants: true }),
    });

    setupEnterprisePlugins();
  });

  it("should return collectionsById unchanged when tenants are disabled", () => {
    const { result } = setupHook({ useTenants: false });

    expect(result.current).not.toHaveProperty(String(COLLECTIONS_TOP_LEVEL_ID));

    expect(result.current).not.toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );
  });

  it("should return collectionsById unchanged when tenants are enabled but no shared collections exist", async () => {
    const { result } = setupHook({ useTenants: true, sharedCollections: [] });

    await waitFor(() => {
      expect(result.current).not.toHaveProperty(
        String(COLLECTIONS_TOP_LEVEL_ID),
      );
    });

    expect(result.current).not.toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );
  });

  it("should merge shared collections when tenants are enabled", async () => {
    const tenantCollection = createMockCollection({
      id: 100 as CollectionId,
      name: "Tenant A",
      location: "/",
      namespace: "shared-tenant-collection" as any,
    });

    const { result } = setupHook({
      useTenants: true,
      sharedCollections: [tenantCollection],
    });

    await waitFor(() => {
      expect(result.current).toHaveProperty(String(COLLECTIONS_TOP_LEVEL_ID));
    });

    expect(result.current).toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );
  });
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

  const collectionsById = mergeSharedCollections(
    baseCollectionsById,
    {
      [ROOT_COLLECTION.id]: sharedRoot,
      [100 as CollectionId]: tenantA,
      [300 as CollectionId]: subCollection,
    },
    "Shared collections",
  );

  return {
    collectionsById,
    ourAnalyticsSubCollection,
    ourAnalyticsNestedCollection,
    tenantA,
    subCollection,
  };
}

describe("mergeSharedCollections", () => {
  it("should create a top-level Collections node with Our analytics and Shared collections as siblings", () => {
    const { collectionsById } = setup();
    const expanded = collectionsById as Record<
      CollectionId,
      ExpandedCollectionNode
    >;

    const topLevel = expanded[COLLECTIONS_TOP_LEVEL_ID];
    expect(topLevel.name).toBe("Collections");
    expect(topLevel.parent).toBeNull();
    expect(topLevel.children).toHaveLength(2);
    expect(topLevel.children[0].id).toBe(ROOT_COLLECTION.id);
    expect(topLevel.children[1].id).toBe(SHARED_TENANT_COLLECTIONS_ROOT_ID);

    const root = expanded[ROOT_COLLECTION.id];
    expect(root.parent?.id).toBe(COLLECTIONS_TOP_LEVEL_ID);
    expect(root.path).toEqual([COLLECTIONS_TOP_LEVEL_ID]);

    const syntheticRoot = expanded[SHARED_TENANT_COLLECTIONS_ROOT_ID];
    expect(syntheticRoot.name).toBe("Shared collections");
    expect(syntheticRoot.parent?.id).toBe(COLLECTIONS_TOP_LEVEL_ID);
    expect(syntheticRoot.path).toEqual([COLLECTIONS_TOP_LEVEL_ID]);
  });

  it("should rewrite paths for Our Analytics sub-collections to include the top-level Collections node", () => {
    const {
      collectionsById,
      ourAnalyticsSubCollection,
      ourAnalyticsNestedCollection,
    } = setup();

    expect(collectionsById[ourAnalyticsSubCollection.id].path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      "root",
    ]);

    expect(collectionsById[ourAnalyticsNestedCollection.id].path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      "root",
      ourAnalyticsSubCollection.id,
    ]);
  });

  it("should re-parent children and rewrite paths through the top-level and synthetic root", () => {
    const { collectionsById, tenantA, subCollection } = setup();
    const expanded = collectionsById as Record<
      CollectionId,
      ExpandedCollectionNode
    >;

    const mergedTenantA = expanded[tenantA.id];

    expect(mergedTenantA.parent?.id).toBe(SHARED_TENANT_COLLECTIONS_ROOT_ID);
    expect(mergedTenantA.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
    ]);

    const mergedSubCollection = expanded[subCollection.id];

    expect(mergedSubCollection.parent?.id).toBe(tenantA.id);
    expect(mergedSubCollection.path).toEqual([
      COLLECTIONS_TOP_LEVEL_ID,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      tenantA.id,
    ]);
  });
});

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupCollectionTreeEndpoint } from "__support__/server-mocks/collection";
import { setupTenantEntpoints } from "__support__/server-mocks/tenant";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { ExpandedCollection } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import type { Collection, CollectionId, Tenant } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  COLLECTIONS_TOP_LEVEL_ID,
  SHARED_TENANT_COLLECTIONS_ROOT_ID,
  TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
  flattenCollectionTree,
  mergeTenantCollections,
} from "../utils/tenant-collections";

import { useCollectionsWithTenants } from "./use-collections-with-tenants";

const createMockExpandedCollection = (
  overrides: Partial<Collection> & { path?: CollectionId[] | null },
): ExpandedCollection => ({
  ...createMockCollection(overrides),
  path: overrides.path ?? [],
  parent: null,
  children: [],
  is_personal: false,
});

type SetupHookOptions = {
  useTenants?: boolean;
  sharedCollections?: Collection[];
  tenants?: Tenant[];
};

function setupHook({
  useTenants = false,
  sharedCollections = [],
  tenants = [],
}: SetupHookOptions = {}) {
  setupCollectionTreeEndpoint(sharedCollections);
  setupTenantEntpoints(tenants);

  const baseRoot = createMockExpandedCollection({
    ...ROOT_COLLECTION,
    path: [],
  });

  const collectionsById: Record<CollectionId, ExpandedCollection> = {
    [ROOT_COLLECTION.id]: baseRoot,
  };

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
      // Unjustified type cast. FIXME
      id: 100 as CollectionId,
      name: "Tenant A",
      location: "/",
      namespace: "shared-tenant-collection",
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

describe("mergeTenantCollections", () => {
  it("adds tenant-specific collections under 'Tenant collections'", () => {
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
      name: "Shared collection: Finance",
      location: "/",
      path: [ROOT_COLLECTION.id],
      namespace: "shared-tenant-collection",
    });

    const sharedRoot = createMockExpandedCollection({
      ...ROOT_COLLECTION,
      name: "Collections",
      path: [],
    });

    tenantSpecificRoot.children = [tenantCollection];
    tenantCollection.parent = tenantSpecificRoot;
    sharedRoot.children = [sharedCollection];
    sharedCollection.parent = sharedRoot;

    const collectionsById = mergeTenantCollections(
      {
        [ROOT_COLLECTION.id]: ourAnalytics,
      },
      {
        [ROOT_COLLECTION.id]: sharedRoot,
        [sharedCollection.id]: sharedCollection,
      },
      {
        [ROOT_COLLECTION.id]: tenantSpecificRoot,
        [tenantCollection.id]: tenantCollection,
      },
      "Shared collections",
      new Map([[tenantCollection.id, "Acme"]]),
    );

    const topLevel = collectionsById[COLLECTIONS_TOP_LEVEL_ID];
    const sharedRootNode = collectionsById[SHARED_TENANT_COLLECTIONS_ROOT_ID];
    const mergedTenantCollection = collectionsById[tenantCollection.id];

    const tenantSpecificRootNode =
      collectionsById[TENANT_SPECIFIC_COLLECTIONS_ROOT_ID];

    expect(topLevel.children.map((collection) => collection.id)).toEqual([
      ROOT_COLLECTION.id,
      SHARED_TENANT_COLLECTIONS_ROOT_ID,
      TENANT_SPECIFIC_COLLECTIONS_ROOT_ID,
    ]);

    expect(sharedRootNode.name).toBe("Shared collections");
    expect(tenantSpecificRootNode.name).toBe("Tenant collections");
    expect(tenantSpecificRootNode.children).toContain(mergedTenantCollection);
    expect(mergedTenantCollection.name).toBe("Acme");
    expect(mergedTenantCollection.parent).toBe(tenantSpecificRootNode);
  });
});

describe("flattenCollectionTree", () => {
  it("includes nested collections", () => {
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

function setup() {
  const baseRoot = createMockExpandedCollection({
    ...ROOT_COLLECTION,
    path: [],
  });

  const ourAnalyticsSubCollection = createMockExpandedCollection({
    id: 200,
    name: "Our Analytics Sub",
    location: "/",
    path: ["root"],
  });

  const ourAnalyticsNestedCollection = createMockExpandedCollection({
    id: 201,
    name: "Nested Sub",
    location: "/200/",
    path: ["root", 200],
  });

  baseRoot.children = [ourAnalyticsSubCollection];
  ourAnalyticsSubCollection.parent = baseRoot;
  ourAnalyticsSubCollection.children = [ourAnalyticsNestedCollection];
  ourAnalyticsNestedCollection.parent = ourAnalyticsSubCollection;

  const baseCollectionsById: Record<CollectionId, ExpandedCollection> = {
    [ROOT_COLLECTION.id]: baseRoot,
    // Unjustified type cast. FIXME
    [200 as CollectionId]: ourAnalyticsSubCollection,
    // Unjustified type cast. FIXME
    [201 as CollectionId]: ourAnalyticsNestedCollection,
  };

  const sharedRoot = createMockExpandedCollection({
    ...ROOT_COLLECTION,
    path: [],
  });

  const tenantA = createMockExpandedCollection({
    id: 100,
    name: "Tenant A",
    location: "/",
    path: ["root"],
  });

  const subCollection = createMockExpandedCollection({
    id: 300,
    name: "Subcollection",
    location: "/100/",
    path: ["root", 100],
  });

  sharedRoot.children = [tenantA];
  tenantA.parent = sharedRoot;
  tenantA.children = [subCollection];
  subCollection.parent = tenantA;

  const collectionsById = mergeTenantCollections(
    baseCollectionsById,
    {
      [ROOT_COLLECTION.id]: sharedRoot,
      // Unjustified type cast. FIXME
      [100 as CollectionId]: tenantA,
      // Unjustified type cast. FIXME
      [300 as CollectionId]: subCollection,
    },
    {},
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

describe("mergeTenantCollections with shared collections", () => {
  it("should create a top-level Collections node with Our analytics and Shared collections as siblings", () => {
    const { collectionsById } = setup();
    // Unjustified type cast. FIXME
    const expanded = collectionsById as Record<
      CollectionId,
      ExpandedCollection
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
    // Unjustified type cast. FIXME
    const expanded = collectionsById as Record<
      CollectionId,
      ExpandedCollection
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

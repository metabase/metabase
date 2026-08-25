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
} from "../utils/tenant-collection-tree";

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

  it("returns collectionsById unchanged when tenants are disabled", () => {
    const { result } = setupHook({ useTenants: false });

    expect(result.current).not.toHaveProperty(String(COLLECTIONS_TOP_LEVEL_ID));
    expect(result.current).not.toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );
  });

  it("returns collectionsById unchanged when tenants have no shared collections", async () => {
    const { result } = setupHook({ useTenants: true });

    await waitFor(() => {
      expect(result.current).not.toHaveProperty(
        String(COLLECTIONS_TOP_LEVEL_ID),
      );
    });

    expect(result.current).not.toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );
  });

  it("merges shared collections when tenants are enabled", async () => {
    const sharedCollection = createMockCollection({
      id: 100,
      name: "Tenant A",
      location: "/",
      namespace: "shared-tenant-collection",
    });
    const { result } = setupHook({
      useTenants: true,
      sharedCollections: [sharedCollection],
    });

    await waitFor(() => {
      expect(result.current).toHaveProperty(String(COLLECTIONS_TOP_LEVEL_ID));
    });

    expect(result.current).toHaveProperty(
      String(SHARED_TENANT_COLLECTIONS_ROOT_ID),
    );
  });
});

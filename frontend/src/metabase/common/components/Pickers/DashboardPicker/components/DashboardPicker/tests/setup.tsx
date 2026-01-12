import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupTenantCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type {
  CollectionId,
  CollectionItem,
  DashboardId,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type {
  DashboardPickerItem,
  DashboardPickerStatePath,
  DashboardPickerValueModel,
} from "../../../types";
import { DashboardPickerModal } from "../../DashboardPickerModal";
import { DashboardPicker, defaultOptions } from "../DashboardPicker";

type NestedCollectionItem = Partial<Omit<CollectionItem, "id">> & {
  id: any;
  is_personal?: boolean;
  descendants: NestedCollectionItem[];
};

const myDashboard = createMockDashboard({
  id: 100,
  name: "My Dashboard 1",
  collection_id: 3,
});

const myDashboard2 = createMockDashboard({
  id: 101,
  name: "My Dashboard 2",
  collection_id: 3,
});

const sharedTenantDashboard = createMockDashboard({
  id: 102,
  name: "Shared Dashboard",
  collection_id: 7,
});

const collectionTree: NestedCollectionItem[] = [
  {
    id: "root",
    model: "collection",
    name: "Our Analytics",
    location: "",
    can_write: true,
    descendants: [
      {
        id: 4,
        name: "Collection 4",
        model: "collection",
        location: "/",
        effective_location: "/",
        can_write: true,
        descendants: [
          {
            id: 3,
            name: "Collection 3",
            model: "collection",
            descendants: [
              {
                ...myDashboard,
                model: "dashboard",
                descendants: [],
              },
              {
                ...myDashboard2,
                model: "dashboard",
                descendants: [],
              },
            ],
            location: "/4/",
            effective_location: "/4/",
            can_write: true,
            is_personal: false,
          },
        ],
      },
      {
        id: 2,
        model: "collection",
        is_personal: false,
        name: "Collection 2",
        location: "/",
        effective_location: "/",
        can_write: true,
        descendants: [],
      },
    ],
  },
  {
    name: "My personal collection",
    id: 1,
    model: "collection",
    location: "/",
    effective_location: "/",
    is_personal: true,
    can_write: true,
    descendants: [
      {
        id: 5,
        model: "collection",
        location: "/1/",
        effective_location: "/1/",
        name: "personal sub_collection",
        is_personal: true,
        can_write: true,
        descendants: [],
      },
    ],
  },
];

const tenantCollectionsTree: NestedCollectionItem[] = [
  {
    name: "tcoll",
    id: 6,
    location: "/",
    effective_location: "/",
    is_personal: false,
    is_shared_tenant_collection: true,
    model: "collection",
    here: ["collection"],
    below: ["dashboard"],
    can_write: true,
    descendants: [
      {
        id: 7,
        location: "/6/",
        effective_location: "/6/",
        name: "tsubcoll",
        model: "collection",
        is_personal: false,
        is_shared_tenant_collection: true,
        can_write: true,
        descendants: [
          {
            ...sharedTenantDashboard,
            model: "dashboard",
            is_tenant_dashboard: true,
            descendants: [],
          },
        ],
        here: ["dashboard"],
      },
    ],
  },
];

const flattenCollectionTree = (
  nodes: NestedCollectionItem[],
): Omit<NestedCollectionItem, "descendants">[] => {
  if (!nodes) {
    return [];
  }
  return nodes.flatMap(({ descendants, ...node }) => [
    node,
    ...flattenCollectionTree(descendants),
  ]);
};

const mockCollectionToCollectionItem = (c: NestedCollectionItem) =>
  createMockCollectionItem({
    ...c,
    ...(c.is_shared_tenant_collection && {
      namespace: "shared-tenant-collection",
    }),
  });

const setupCollectionTreeMocks = (node: NestedCollectionItem[]) => {
  node.forEach((node) => {
    if (!node.descendants) {
      return;
    }
    const collectionItems = node.descendants.map((c: NestedCollectionItem) =>
      createMockCollectionItem(c),
    );

    // Skip root since it's handled separately (tenant-aware)
    if (node.id !== "root") {
      setupCollectionItemsEndpoint({
        collection: createMockCollection({ id: node.id }),
        collectionItems,
        models: ["collection", "dashboard"],
      });
    }

    if (collectionItems.length > 0) {
      setupCollectionTreeMocks(node.descendants);
    }
  });
};

const setupTenantCollectionTreeMocks = (node: NestedCollectionItem[]): void => {
  node.forEach((n) => {
    const collectionItems = n.descendants.map((c: NestedCollectionItem) =>
      mockCollectionToCollectionItem(c),
    );

    setupTenantCollectionItemsEndpoint({
      collection: createMockCollection({ id: n.id }),
      collectionItems,
      models: ["collection", "dashboard"],
    });

    if (collectionItems.length > 0) {
      setupTenantCollectionTreeMocks(n.descendants);
    }
  });
};

export interface SetupOpts {
  initialValue?: {
    id: CollectionId | DashboardId;
    model: "collection" | "dashboard";
  };
  onChange?: (item: DashboardPickerItem) => void;
  models?: [DashboardPickerValueModel, ...DashboardPickerValueModel[]];
  options?: typeof defaultOptions;
  ee?: boolean;
}

const commonSetup = ({ ee = false }: { ee?: boolean } = {}) => {
  setupRecentViewsAndSelectionsEndpoints([]);
  mockGetBoundingClientRect();
  setupSearchEndpoints([]);
  setupDatabasesEndpoints([]);

  const allItems = flattenCollectionTree(collectionTree).map(
    createMockCollectionItem,
  );

  allItems.forEach((item) => {
    if (item.model !== "collection") {
      fetchMock.get(`path:/api/dashboard/${item.id}`, item);
    } else {
      fetchMock.get(`path:/api/collection/${item.id}`, item);
    }
  });

  setupCollectionTreeMocks(collectionTree);

  // Setup root collection items endpoint (handles both regular and tenant requests)
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: collectionTree[0].descendants.map(
      createMockCollectionItem,
    ),
    tenantRootItems: ee
      ? [mockCollectionToCollectionItem(tenantCollectionsTree[0])]
      : [],
  });

  if (ee) {
    const allTenantItems = flattenCollectionTree(tenantCollectionsTree).map(
      createMockCollectionItem,
    );

    setupEnterprisePlugins();
    setupTenantCollectionTreeMocks(tenantCollectionsTree);

    allTenantItems.forEach((item) => {
      if (item.model !== "collection") {
        fetchMock.get(`path:/api/dashboard/${item.id}`, item);
      } else {
        fetchMock.get(`path:/api/collection/${item.id}`, {
          ...item,
          namespace: "shared-tenant-collection",
        });
      }
    });
  }
};

export const setupPicker = async ({
  initialValue = { id: "root", model: "collection" },
  onChange = jest.fn<void, [DashboardPickerItem]>(),
  ee = false,
}: SetupOpts = {}) => {
  const settings = mockSettings(
    createMockSettings({
      "token-features": createMockTokenFeatures({
        tenants: ee ? true : false,
      }),
      "use-tenants": ee,
    }),
  );

  commonSetup({ ee });

  function TestComponent() {
    const [path, setPath] = useState<DashboardPickerStatePath>();

    return (
      <DashboardPicker
        initialValue={initialValue}
        options={defaultOptions}
        path={path}
        onItemSelect={onChange}
        onPathChange={setPath}
      />
    );
  }

  renderWithProviders(<TestComponent />, {
    storeInitialState: createMockState({ settings }),
  });

  await waitForLoaderToBeRemoved();
};

export const setupModal = async ({
  initialValue,
  onChange = jest.fn<void, [DashboardPickerItem]>(),
  options = defaultOptions,
}: SetupOpts = {}) => {
  commonSetup();

  renderWithProviders(
    <DashboardPickerModal
      onChange={onChange}
      value={initialValue}
      onClose={jest.fn()}
      options={options}
    />,
  );

  await waitForLoaderToBeRemoved();
};

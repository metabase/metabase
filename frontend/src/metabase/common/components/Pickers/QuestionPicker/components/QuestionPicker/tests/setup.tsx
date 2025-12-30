import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupDashboardItemsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupTenantCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { CollectionId, CollectionItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type {
  QuestionPickerItem,
  QuestionPickerStatePath,
  QuestionPickerValueModel,
} from "../../../types";
import { QuestionPickerModal } from "../../QuestionPickerModal";
import { QuestionPicker, defaultOptions } from "../QuestionPicker";

type NestedCollectionItem = Partial<Omit<CollectionItem, "id">> & {
  id: any;
  is_personal?: boolean;
  descendants?: NestedCollectionItem[];
  dashboard_id?: number;
};

const rootQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 104,
    name: "Question in Root",
    collection_id: null,
  }),
  model: "card",
});

const tenantQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 110,
    name: "Tenant Question",
    collection_id: 7,
  }),
  model: "card",
});

export const rootDashboard = createMockCollectionItem({
  ...createMockDashboard({
    name: "Root Dashboard",
    collection_id: null,
  }),
  id: 105,
  location: "/",
  model: "dashboard",
});

export const rootDashboardQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 111,
    name: "DQ in Root",
    collection_id: null,
    dashboard_id: rootDashboard.id,
  }),
  model: "card",
});

export const nestedQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 100,
    name: "Nested Question",
    collection_id: 3,
  }),
  model: "card",
});

const nestedDashboard = createMockCollectionItem({
  ...createMockDashboard({
    name: "Nested Dashboard",
    collection_id: 3,
    collection: createMockCollection({
      id: 3,
      location: "/4/",
    }),
  }),
  location: "/4/",
  id: 106,
  model: "dashboard",
});

const tenantDashboard = createMockCollectionItem({
  ...createMockDashboard({
    name: "Tenant Dashboard",
    collection_id: 7,
    collection: createMockCollection({
      id: 7,
      location: "/6/7/",
      namespace: "shared-tenant-collection",
    }),
  }),
  location: "/6/7/",
  id: 120,
  model: "dashboard",
  is_tenant_dashboard: true,
});

const tenantDashboardQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 121,
    name: "DQ in TenantDashboard",
    collection_id: 7,
    dashboard_id: tenantDashboard.id,
    dashboard: tenantDashboard,
  }),
  model: "card",
});

export const nestedDashboardQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 108,
    name: "Nested DQ",
    collection_id: 3,
    dashboard_id: nestedDashboard.id,
    dashboard: nestedDashboard,
  }),
  model: "card",
});

const myVerifiedQuestion = createMockCollectionItem({
  ...createMockCard({
    id: 103,
    name: "My Verified Question",
    collection_id: 3,
  }),
  moderated_status: "verified",
});

export const myModel = createMockCollectionItem({
  ...createMockCard({
    id: 101,
    name: "My Model",
    collection_id: 3,
    type: "model",
  }),
  model: "dataset",
});

export const myMetric = createMockCollectionItem({
  ...createMockCard({
    id: 102,
    name: "My Metric",
    collection_id: 3,
    type: "metric",
  }),
  model: "metric",
});

const collectionTree: NestedCollectionItem[] = [
  {
    id: "root" as any,
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
        can_write: true,
        descendants: [
          {
            id: 3,
            name: "Collection 3",
            model: "collection",
            descendants: [
              nestedQuestion,
              nestedDashboard,
              nestedDashboardQuestion,
              myModel,
              myMetric,
              myVerifiedQuestion,
            ],
            location: "/4/",
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
        can_write: true,
        descendants: [],
      },
      rootQuestion,
      rootDashboard,
      rootDashboardQuestion,
    ],
  },
  {
    name: "My personal collection",
    id: 1,
    model: "collection",
    location: "/",
    is_personal: true,
    can_write: true,
    descendants: [
      {
        id: 5,
        model: "collection",
        location: "/1/",
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
    below: ["card", "dashboard"],
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
        descendants: [tenantQuestion, tenantDashboard, tenantDashboardQuestion],
        here: ["card", "dashboard"],
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
  return nodes.flatMap(({ descendants = [], ...node }) => [
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
    const collectionItems = node.descendants
      .filter((item) => !item.dashboard_id) //We don't show dashboard items in collection item endpoints
      .map((c: NestedCollectionItem) => createMockCollectionItem(c));

    // Skip root since it's handled separately (tenant-aware)
    if (node.id !== "root") {
      setupCollectionItemsEndpoint({
        collection: createMockCollection({ id: node.id }),
        collectionItems,
      });
    }

    if (collectionItems.length > 0) {
      setupCollectionTreeMocks(node.descendants);
    }
  });
};

const setupTenantCollectionTreeMocks = (node: NestedCollectionItem[]): void => {
  node.forEach((n) => {
    if (!n.descendants) {
      return;
    }
    const collectionItems = n.descendants
      .filter((item) => !item.dashboard_id) //We don't show dashboard items in collection item endpoints
      .map((c: NestedCollectionItem) => mockCollectionToCollectionItem(c));

    setupTenantCollectionItemsEndpoint({
      collection: createMockCollection({ id: n.id }),
      collectionItems,
    });

    if (collectionItems.length > 0) {
      setupTenantCollectionTreeMocks(n.descendants);
    }
  });
};

interface SetupOpts {
  initialValue?: {
    id: CollectionId;
    model: "collection" | "card" | "dataset" | "metric";
  };
  onChange?: (item: QuestionPickerItem) => void;
  models?: [QuestionPickerValueModel, ...QuestionPickerValueModel[]];
  options?: typeof defaultOptions;
  isEE?: boolean;
}

const commonSetup = ({ isEE = false }: { isEE?: boolean } = {}) => {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([]);

  const allItems = flattenCollectionTree(collectionTree).map(
    createMockCollectionItem,
  );

  allItems.forEach((item) => {
    if (item.model === "collection") {
      fetchMock.get(`path:/api/collection/${item.id}`, item);
    } else if (item.model === "dashboard") {
      fetchMock.get(`path:/api/dashboard/${item.id}`, item);

      const dashboardId = item.id;
      const dashboardItems = allItems.filter(
        (item: any) => item.dashboard_id === dashboardId,
      );
      setupDashboardItemsEndpoint({
        dashboard: item as any,
        dashboardItems,
      });
    } else {
      fetchMock.get(`path:/api/card/${item.id}`, item);
    }
  });

  setupCollectionTreeMocks(collectionTree);

  setupRootCollectionItemsEndpoint({
    rootCollectionItems:
      collectionTree[0].descendants
        ?.filter((item) => !item.dashboard_id)
        .map(createMockCollectionItem) ?? [],
    tenantRootItems: isEE
      ? [mockCollectionToCollectionItem(tenantCollectionsTree[0])]
      : [],
  });

  if (isEE) {
    const allTenantItems = flattenCollectionTree(tenantCollectionsTree).map(
      createMockCollectionItem,
    );

    setupTenantCollectionTreeMocks(tenantCollectionsTree);

    allTenantItems.forEach((item) => {
      if (item.model === "collection") {
        fetchMock.get(`path:/api/collection/${item.id}`, {
          ...item,
          namespace: "shared-tenant-collection",
        });
      } else if (item.model === "dashboard") {
        fetchMock.get(`path:/api/dashboard/${item.id}`, item);

        const dashboardId = item.id;
        const dashboardItems = allTenantItems.filter(
          (item: any) => item.dashboard_id === dashboardId,
        );
        setupDashboardItemsEndpoint({
          dashboard: item as any,
          dashboardItems,
        });
      } else {
        fetchMock.get(`path:/api/card/${item.id}`, item);
      }
    });
  }
};

export const setupPicker = async ({
  initialValue = { id: "root", model: "collection" },
  onChange = jest.fn<void, [QuestionPickerItem]>(),
  isEE = false,
}: SetupOpts = {}) => {
  commonSetup({ isEE });

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      content_verification: isEE,
      official_collections: isEE,
      tenants: isEE,
    }),
    "use-tenants": isEE,
  });

  const storeInitialState = createMockState({
    settings,
  });

  if (isEE) {
    setupEnterprisePlugins();
  }

  function TestComponent() {
    const [path, setPath] = useState<QuestionPickerStatePath>();

    return (
      <QuestionPicker
        initialValue={initialValue}
        models={["card", "dashboard"]}
        options={defaultOptions}
        path={path}
        onInit={jest.fn()}
        onItemSelect={onChange}
        onPathChange={setPath}
      />
    );
  }

  renderWithProviders(<TestComponent />, { storeInitialState });

  await waitForLoaderToBeRemoved();
};

// zero indexed
export const level = async (index: number) => {
  return within(await screen.findByTestId(`item-picker-level-${index}`));
};

export const setupModal = async ({
  initialValue,
  models = ["card", "dataset"],
  onChange = jest.fn<void, [QuestionPickerItem]>(),
  options = defaultOptions,
}: SetupOpts = {}) => {
  commonSetup();

  renderWithProviders(
    <QuestionPickerModal
      onChange={onChange}
      value={initialValue}
      onClose={jest.fn()}
      models={models}
      options={options}
    />,
  );

  await waitForLoaderToBeRemoved();
};

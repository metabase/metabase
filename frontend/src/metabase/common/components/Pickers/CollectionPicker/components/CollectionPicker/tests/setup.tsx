import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupDatabaseListEndpoint,
  setupRootCollectionItemsEndpoint,
  setupTenantCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { mockGetBoundingClientRect, renderWithProviders } from "__support__/ui";
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type {
  CollectionPickerItem,
  CollectionPickerOptions,
  CollectionPickerStatePath,
} from "../../../types";
import { CollectionPicker } from "../CollectionPicker";

type MockCollection = {
  id: CollectionId;
  name: string;
  location: string | null;
  effective_location: string | null;
  is_personal: boolean;
  is_shared_tenant_collection?: boolean;
  collections: MockCollection[];
  here: CollectionItem["here"];
};

const collectionTree: MockCollection[] = [
  {
    id: "root",
    name: "Our Analytics",
    location: null,
    effective_location: null,
    is_personal: false,
    here: ["collection"],
    collections: [
      {
        id: 4,
        name: "Collection 4",
        location: "/",
        effective_location: "/",
        is_personal: false,
        here: ["collection"],
        collections: [
          {
            id: 3,
            name: "Collection 3",
            collections: [],
            location: "/4/",
            effective_location: "/4/",
            here: [],
            is_personal: false,
          },
        ],
      },
      {
        id: 2,
        is_personal: false,
        name: "Collection 2",
        location: "/",
        effective_location: "/",
        here: [],
        collections: [],
      },
    ],
  },
  {
    name: "My personal collection",
    id: 1,
    location: "/",
    effective_location: "/",
    is_personal: true,
    here: ["collection"],
    collections: [
      {
        id: 5,
        location: "/1/",
        effective_location: "/1/",
        name: "personal sub_collection",
        is_personal: true,
        here: [],
        collections: [],
      },
    ],
  },
];

const tenantCollectionsTree: MockCollection[] = [
  {
    name: "tcoll",
    id: 6,
    location: "/",
    effective_location: "/",
    is_personal: false,
    is_shared_tenant_collection: true,
    here: ["collection"],
    collections: [
      {
        id: 7,
        location: "/6/",
        effective_location: "/6/",
        name: "tsubcoll",
        is_personal: false,
        is_shared_tenant_collection: true,
        collections: [],
        here: [],
      },
    ],
  },
];

const flattenCollectionTree = (
  node: MockCollection[],
): Omit<MockCollection, "collections">[] => {
  return [
    ...node.map((n) => ({
      name: n.name,
      id: n.id,
      is_personal: !!n.is_personal,
      ...(n.is_shared_tenant_collection !== undefined && {
        is_shared_tenant_collection: n.is_shared_tenant_collection,
      }),
      location: n.location,
      effective_location: n.effective_location,
      here: n.here,
    })),
  ].concat(...node.map((n) => flattenCollectionTree(n.collections)));
};

const mockCollectionToCollectionItem = (c: MockCollection) =>
  createMockCollectionItem({
    id: c.id as number,
    name: c.name,
    model: "collection",
    location: c.location || "/",
    effective_location: c.effective_location || "/",
    here: c.here,
    ...(c.is_shared_tenant_collection && {
      namespace: "shared-tenant-collection",
    }),
  });

const setupCollectionTreeMocks = (node: MockCollection[]) => {
  node.forEach((n) => {
    const collectionItems = n.collections.map(mockCollectionToCollectionItem);

    // Skip root since it's handled separately (tenant-aware in EE mode)
    if (n.id !== "root") {
      setupCollectionItemsEndpoint({
        collection: createMockCollection({ id: n.id }),
        collectionItems,
        models: ["collection"],
      });
    }

    if (collectionItems.length > 0) {
      setupCollectionTreeMocks(n.collections);
    }
  });
};

const setupTenantCollectionTreeMocks = (node: MockCollection[]) => {
  node.forEach((n) => {
    const collectionItems = n.collections.map(mockCollectionToCollectionItem);

    setupTenantCollectionItemsEndpoint({
      collection: createMockCollection({ id: n.id }),
      collectionItems,
      models: ["collection"],
    });

    if (collectionItems.length > 0) {
      setupTenantCollectionTreeMocks(n.collections);
    }
  });
};

export interface SetupOpts {
  initialValue?: {
    id: CollectionId;
    model: "collection";
  };
  onItemSelect?: (item: CollectionPickerItem) => void;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
  ee?: boolean;
  options?: CollectionPickerOptions;
}

export const setup = ({
  initialValue = { id: "root", model: "collection" },
  onItemSelect = jest.fn<void, [CollectionPickerItem]>(),
  shouldDisableItem,
  ee = false,
  options,
}: SetupOpts = {}) => {
  mockGetBoundingClientRect();

  const allCollections = flattenCollectionTree(collectionTree).map((c) =>
    createMockCollection(c as Collection),
  );

  //Setup individual collection mocks
  allCollections.forEach((collection) => {
    fetchMock.get(`path:/api/collection/${collection.id}`, collection);
  });

  setupCollectionTreeMocks(collectionTree);

  setupRootCollectionItemsEndpoint({
    rootCollectionItems: collectionTree[0].collections.map(
      mockCollectionToCollectionItem,
    ),
    tenantRootItems: ee
      ? [mockCollectionToCollectionItem(tenantCollectionsTree[0])]
      : [],
  });

  setupDatabaseListEndpoint([]);

  const settings = mockSettings(
    createMockSettings({
      "token-features": createMockTokenFeatures({
        tenants: ee ? true : false,
      }),
      "use-tenants": ee ? true : false,
    }),
  );

  // Update root mock to handle tenant namespace in EE mode
  if (ee) {
    setupEnterprisePlugins();
    setupTenantCollectionTreeMocks(tenantCollectionsTree);

    const allTenantCollections = flattenCollectionTree(tenantCollectionsTree);

    //Setup individual collection mocks
    allTenantCollections.forEach((collection) => {
      fetchMock.get(`path:/api/collection/${collection.id}`, {
        ...collection,
        namespace: "shared-tenant-collection",
      });
    });
  }

  function TestComponent() {
    const [path, setPath] = useState<CollectionPickerStatePath>();

    const handlePathChange = (newPath: CollectionPickerStatePath) => {
      setPath(newPath);
    };

    return (
      <CollectionPicker
        initialValue={initialValue}
        path={path}
        onInit={jest.fn()}
        onItemSelect={onItemSelect}
        onPathChange={handlePathChange}
        shouldDisableItem={shouldDisableItem}
        options={options}
      />
    );
  }

  return renderWithProviders(<TestComponent />, {
    storeInitialState: createMockState({
      settings,
    }),
  });
};

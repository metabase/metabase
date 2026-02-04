import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { Database, RecentItem, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
  createMockSearchResults,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  EntityPickerModal,
  type EntityPickerModalProps,
} from "../EntityPickerModal";

const mockSearchResults = createMockSearchResults({
  items: [
    createMockSearchResult({
      name: "Search Result Collection 0",
      model: "collection",
      can_write: true,
      id: 600,
    }),
    createMockSearchResult({
      name: "Search Result Collection 1",
      model: "collection",
      can_write: true,
      id: 601,
    }),
    createMockSearchResult({
      name: "Search Result Collection 2",
      model: "collection",
      can_write: true,
      id: 602,
    }),
    createMockSearchResult({
      name: "Search Result Card 3",
      database_id: 1,
      model: "card",
      id: 603,
    }),
    createMockSearchResult({
      name: "Search Result Card 4",
      database_id: 2,
      model: "card",
      id: 604,
    }),
    createMockSearchResult({
      name: "Search Result Dashboard 5",
      model: "dashboard",
      id: 605,
    }),
    createMockSearchResult({
      name: "Search Result Dashboard 6",
      model: "dashboard",
      id: 606,
    }),
    createMockSearchResult({
      name: "Search Result Metric 7",
      model: "metric",
      id: 607,
    }),
    createMockSearchResult({
      name: "Search Result Metric 8",
      model: "metric",
      id: 608,
    }),
    createMockSearchResult({
      name: "Search Result Table 9",
      model: "table",
      id: 609,
    }),
    createMockSearchResult({
      name: "Search Result Table 10",
      model: "table",
      database_id: 2,
      id: 610,
    }),
  ],
});
const mockRecentItems = [
  createMockRecentCollectionItem({
    id: 100,
    model: "card",
    name: "Recent Question 1",
    description: "A card",
    timestamp: "2025-11-01T00:00:00",
  }),
  createMockRecentCollectionItem({
    id: 200,
    model: "card",
    name: "Recent Question 2",
    description: "sometimes invisible",
    timestamp: "2025-11-01T00:00:00",
  }),
  createMockRecentCollectionItem({
    id: 101,
    model: "dashboard",
    name: "Recent Dashboard",
    description: "A board",
    timestamp: "2025-11-01T00:00:00",
  }),
  createMockRecentTableItem({
    id: 102,
    model: "table",
    name: "Recent_Table",
    display_name: "Recent Table",
    description: "A tableau",
    timestamp: "2025-11-01T00:00:00",
  }),
  createMockRecentCollectionItem({
    id: 300,
    model: "collection",
    name: "Recent_Collection",
    timestamp: "2025-11-01T00:00:00",
  }),
];

// Collection tree structure
const rootCollection = createMockCollection(ROOT_COLLECTION);

const collection1 = createMockCollection({
  id: 11,
  name: "First Collection",
  here: ["card", "metric"],
  below: ["card", "metric"],
  location: "/",
});

const collection2 = createMockCollection({
  id: 22,
  name: "Second Collection",
  here: ["card", "metric"],
  below: ["card", "metric"],
  location: "/",
  can_write: false,
});

const nestedCollection = createMockCollection({
  id: 33,
  name: "Nested Collection",
  location: "/11/",
  here: ["card", "metric"],
  below: ["card", "metric"],
});

// Collection items
const rootCollectionItems = [
  createMockCollectionItem({
    id: 11,
    model: "collection",
    name: collection1.name,
    here: ["collection"],
    below: ["collection", "card"],
    collection_id: null,
    can_write: true,
  }),
  createMockCollectionItem({
    id: 22,
    model: "collection",
    name: collection2.name,
    here: ["collection"],
    below: ["collection", "card"],
    collection_id: null,
    can_write: false,
  }),
];

const collection1Items = [
  createMockCollectionItem({
    id: 100,
    model: "card",
    name: "Question in Collection 1",
    collection_id: 1,
  }),
  createMockCollectionItem({
    id: 101,
    model: "dashboard",
    name: "Dashboard in Collection 1",
    collection_id: 1,
  }),
  createMockCollectionItem({
    id: 33,
    model: "collection",
    name: nestedCollection.name,
    collection_id: 1,
    here: ["collection"],
    below: ["collection", "card"],
    location: "/1/",
    can_write: true,
  }),
];

const collection2Items = [
  createMockCollectionItem({
    id: 200,
    model: "card",
    name: "Question in Collection 2",
    collection_id: 2,
  }),
  createMockCollectionItem({
    id: 201,
    model: "dataset",
    name: "Model in Collection 2",
    collection_id: 2,
  }),
];

const nestedCollectionItems = [
  createMockCollectionItem({
    id: 300,
    model: "card",
    name: "Question in Nested Coll",
    collection_id: 33,
  }),
  createMockCollectionItem({
    id: 301,
    model: "metric",
    name: "Metric in Nested Coll",
    collection_id: 33,
  }),
];

const mockDatabases = [
  createMockDatabase({
    id: 1,
    name: "Database 1",
    tables: [
      createMockTable({
        id: 10,
        db_id: 1,
        display_name: "Table 10",
        schema: "schema one",
      }),
      createMockTable({
        id: 11,
        db_id: 1,
        display_name: "Table 11",
        schema: "schema one",
      }),
      createMockTable({
        id: 12,
        db_id: 1,
        display_name: "Table 12",
        schema: "schema two",
      }),
    ],
  }),
  createMockDatabase({
    id: 2,
    name: "Database 2",
    tables: [
      createMockTable({
        id: 20,
        db_id: 2,
        display_name: "Table 20",
        schema: "schema three",
      }),
      createMockTable({
        id: 21,
        db_id: 2,
        display_name: "Table 21",
        schema: "schema three",
      }),
      createMockTable({
        id: 22,
        db_id: 2,
        display_name: "Table 22",
        schema: "schema three",
      }),
    ],
  }),
  createMockDatabase({
    id: 3,
    name: "Database 3",
    tables: [
      createMockTable({
        id: 30,
        db_id: 3,
        display_name: "Table 30",
        schema: "schema four",
      }),
      createMockTable({
        id: 31,
        db_id: 3,
        display_name: "Table 31",
        schema: "schema four",
      }),
      createMockTable({
        id: 32,
        db_id: 3,
        display_name: "Table 32",
        schema: "schema five",
      }),
    ],
  }),
];

export type SetupOpts = Partial<EntityPickerModalProps> & {
  recentItems?: RecentItem[];
  searchResults?: SearchResult[];
  databases?: Database[];
};

export const setup = async ({ databases, ...rest }: SetupOpts = {}) => {
  process.env.OVERSCAN = "20"; // for VirtualizedList overscan
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints(mockRecentItems, [
    "views",
    "selections",
  ]);

  setupDatabasesEndpoints(databases ?? mockDatabases);

  // Setup collections
  setupCollectionsEndpoints({
    collections: [collection1, collection2, nestedCollection],
    rootCollection,
  });

  // Setup collection by ID endpoints
  setupCollectionByIdEndpoint({
    collections: [collection1, collection2, nestedCollection],
  });

  // Setup collection items endpoints for the tree structure
  setupRootCollectionItemsEndpoint({
    rootCollectionItems,
  });

  setupCollectionItemsEndpoint({
    collection: collection1,
    collectionItems: collection1Items,
  });

  setupCollectionItemsEndpoint({
    collection: collection2,
    collectionItems: collection2Items,
  });

  setupCollectionItemsEndpoint({
    collection: nestedCollection,
    collectionItems: nestedCollectionItems,
  });

  fetchMock.get("path:/api/search", mockSearchResults);
  fetchMock.get("path:/api/user/recipients", { data: [] });
  const onChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <EntityPickerModal
      title={"Pick a thing"}
      onClose={onClose}
      onChange={onChange}
      models={[
        "table",
        "collection",
        "transform",
        "dashboard",
        "snippet",
        "card",
        "dataset",
        "metric",
      ]}
      {...rest}
    />,
  );

  await waitForLoaderToBeRemoved();

  return { onChange, onClose };
};

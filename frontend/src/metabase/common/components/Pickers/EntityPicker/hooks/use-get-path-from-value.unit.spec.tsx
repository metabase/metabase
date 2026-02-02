import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type {
  Collection,
  CollectionItem,
  CollectionNamespace,
  Database,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type {
  EntityPickerOptions,
  OmniPickerCollectionItem,
  OmniPickerItem,
  OmniPickerValue,
} from "../types";

import { useGetPathFromValue } from "./use-get-path-from-value";

const personalCollection = createMockCollection({
  id: 1001,
  name: "Admin's Personal Collection",
  location: "/",
  is_personal: true,
  personal_owner_id: 1,
});

const defaultOptions: EntityPickerOptions = {
  hasSearch: true,
  hasRecents: false,
  hasDatabases: false,
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: true,
};

interface SetupOpts {
  value?: OmniPickerValue;
  options?: EntityPickerOptions;
  namespaces?: CollectionNamespace[];
  collections?: Collection[];
  models?: OmniPickerCollectionItem["model"][];
  databases?: Database[];
  enterprise?: boolean;
}

const setup = ({
  value,
  options = defaultOptions,
  namespaces = [null],
  models = ["collection", "card"],
  collections = [],
  databases = [],
  enterprise = false,
}: SetupOpts = {}) => {
  const rootCollection = createMockCollection({
    id: "root",
    name: "Our analytics",
  });

  setupCollectionsEndpoints({
    collections: [rootCollection, ...collections],
    rootCollection,
  });

  setupCollectionByIdEndpoint({
    collections: [rootCollection, personalCollection, ...collections],
  });
  setupDatabasesEndpoints(databases);

  const user = createMockUser({
    id: 1,
    first_name: "Admin",
    last_name: "McTesterson",
    personal_collection_id: personalCollection.id,
  });

  // Setup personal collection
  if (personalCollection) {
    fetchMock.get(
      `path:/api/collection/${personalCollection.id}`,
      personalCollection,
    );
  }

  const enterpriseTokenFeatures = {
    data_studio: true,
    transforms: true,
    tenants: true,
  };

  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(
        enterprise ? enterpriseTokenFeatures : {},
      ),
    }),
    currentUser: user,
  });

  if (enterprise) {
    setupEnterpriseOnlyPlugin("library");
    setupEnterpriseOnlyPlugin("tenants");
    setupEnterpriseOnlyPlugin("transforms");
  } else {
    reinitialize();
  }

  return renderHookWithProviders(
    () => useGetPathFromValue({ value, options, namespaces, models }),
    {
      storeInitialState,
    },
  );
};

function expectPathToMatch(
  path: OmniPickerItem[],
  expectedPath: Partial<OmniPickerItem>[],
) {
  expect(path).toHaveLength(expectedPath.length);
  expectedPath.forEach((expectedItem, index) => {
    expect(path[index]).toMatchObject(expectedItem);
  });
}

async function waitForPathLength(
  result: ReturnType<typeof setup>["result"],
  length: number,
) {
  return waitFor(() => {
    const [path] = result.current;
    expect(path).toHaveLength(length);
  });
}

describe("useGetPathFromValue", () => {
  describe("default path (no value provided)", () => {
    it("should return database collection when hasDatabases is true", async () => {
      const libraryCollection = createMockCollection({
        id: 1,
        name: "Library",
      });

      const { result } = setup({
        options: {
          ...defaultOptions,
          hasDatabases: true,
          hasRecents: true,
          hasLibrary: false,
        },
        collections: [libraryCollection],
        databases: [
          createMockDatabase({ id: 1, name: "DB1" }),
          createMockDatabase({ id: 2, name: "DB2" }),
        ],
      });

      await waitForPathLength(result, 1);
      const [path] = result.current;

      expectPathToMatch(path, [{ id: "databases", name: "Databases" }]);
    });

    it("should return recents collection when hasRecents is true", async () => {
      const { result } = setup({
        options: {
          ...defaultOptions,
          hasRecents: true,
          hasDatabases: false, // only if databases is false
        },
      });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [{ id: "recents", name: "Recent items" }]);
    });

    it("should return root collection when hasRootCollection is true", async () => {
      const { result } = setup({
        options: {
          ...defaultOptions,
          hasRootCollection: true,
          hasDatabases: false,
          hasRecents: false,
        },
      });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [{ id: "root", name: "Our analytics" }]);
    });

    it("should return empty path when no default options are set", async () => {
      const { result } = setup({
        options: {
          hasRecents: false,
          hasDatabases: false,
          hasLibrary: false,
          hasRootCollection: false,
        },
      });

      await waitFor(() => {
        const [, , { isLoadingPath }] = result.current;
        expect(isLoadingPath).toBe(false);
      });

      const [path] = result.current;
      expect(path).toHaveLength(0);
    });
  });

  describe("collection item paths", () => {
    it("should return path for root collection (our analytics)", async () => {
      const value: OmniPickerValue = {
        model: "collection",
        id: "root",
        namespace: null,
      };

      const { result } = setup({ value });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [{ id: "root" }]);
    });

    it("should return a path for a card in our analytics", async () => {
      const card = createMockCard({
        id: 132,
        name: "Test Card",
        collection_id: null,
      });
      const value: OmniPickerValue = {
        model: "card",
        id: 132,
        namespace: null,
      };

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            id: card.id,
            model: "card",
          } as CollectionItem),
        ],
      });

      setupCardEndpoints(card);

      const { result } = setup({ value });

      await waitForPathLength(result, 2);

      const [path] = result.current;
      expectPathToMatch(path, [{ id: "root" }, { id: card.id, model: "card" }]);
    });

    it("should return path for root snippet collection", async () => {
      const value: OmniPickerValue = {
        model: "collection",
        id: "root",
        namespace: "snippets",
      };

      const { result } = setup({ value, namespaces: ["snippets"] });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [{ id: "root", name: "SQL Snippets" }]);
    });

    it("should return path for a nested collection in normal namespace", async () => {
      const parentCollection = createMockCollection({
        id: 16,
        name: "Parent",
        location: "/",
      });

      const childCollection = createMockCollection({
        id: 26,
        name: "Child",
        location: "/16/",
      });

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            ...parentCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: parentCollection,
        collectionItems: [
          createMockCollectionItem({
            ...childCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 123,
            name: "Grandchild card",
            model: "card",
          } as CollectionItem),
          createMockCollectionItem({
            id: 1234,
            name: "Grandchild collection",
            location: "/16/26/",
            model: "collection",
          } as CollectionItem),
        ],
      });

      const value: OmniPickerValue = {
        model: "collection",
        id: childCollection.id,
        namespace: null,
      };

      const { result } = setup({
        value,
        collections: [parentCollection, childCollection],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        {
          id: "root",
          name: "Our analytics",
          model: "collection",
          namespace: null,
        },
        { id: parentCollection.id, model: "collection" },
        { id: childCollection.id, model: "collection" },
      ]);
    });

    it("should use effective_location for collection path", async () => {
      const parentCollection = createMockCollection({
        id: 16,
        name: "Parent",
        location: "/",
      });

      const childCollection = createMockCollection({
        id: 26,
        name: "Child",
        location: "/16/",
      });

      const grandchildCollection = createMockCollection({
        id: 36,
        name: "Grandchild",
        location: "/16/26/",
        effective_location: "/16/",
      });

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            ...parentCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: parentCollection,
        collectionItems: [
          createMockCollectionItem({
            ...childCollection,
            model: "collection",
          } as CollectionItem),
          createMockCollectionItem({
            id: grandchildCollection.id,
            name: grandchildCollection.name,
            location: "/16/26/",
            effective_location: "/16/",
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 123,
            name: "Grandchild card",
            model: "card",
          } as CollectionItem),
          createMockCollectionItem({
            id: grandchildCollection.id,
            name: grandchildCollection.name,
            location: "/16/26/",
            effective_location: "/16/",
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: grandchildCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 12333,
            name: "great Grandchild card",
            model: "card",
          } as CollectionItem),
        ],
      });

      const value: OmniPickerValue = {
        model: "collection",
        id: grandchildCollection.id,
        namespace: null,
      };

      const { result } = setup({
        value,
        collections: [parentCollection, childCollection, grandchildCollection],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        {
          id: "root",
          name: "Our analytics",
          model: "collection",
          namespace: null,
        },
        { id: parentCollection.id, model: "collection" },
        // should skip child collection due to effective_location
        { id: grandchildCollection.id, model: "collection" },
      ]);
    });

    it("should be able to start at the databases root", async () => {
      const value: OmniPickerValue = {
        model: "collection",
        id: "databases",
      };

      const { result } = setup({
        value,
        options: { hasDatabases: true, hasRecents: true },
      });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [
        {
          id: "databases",
          name: "Databases",
          model: "collection",
        },
      ]);
    });

    it("should be able to start at the recents root", async () => {
      const value: OmniPickerValue = {
        model: "collection",
        id: "recents",
      };

      const { result } = setup({
        value,
        options: { hasDatabases: true, hasRecents: true },
      });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [
        {
          id: "recents",
          name: "Recent items",
          model: "collection",
        },
      ]);
    });
  });

  describe("database paths", () => {
    const testDb = createMockDatabase({
      id: 1,
      name: "Test Database",
      tables: [
        createMockTable({ id: 10, name: "Table10", schema: "schema1" }),
        createMockTable({ id: 11, name: "Table11", schema: "schema2" }),
        createMockTable({ id: 12, name: "Table12", schema: "schema2" }),
        createMockTable({ id: 13, name: "Table13", schema: "schema2" }),
      ],
    });

    const testDbSingleSchema = createMockDatabase({
      id: 2,
      name: "Test Database",
      tables: [
        createMockTable({
          id: 21,
          db_id: 2,
          name: "Table21",
          schema: "schema1",
        }),
        createMockTable({
          id: 22,
          db_id: 2,
          name: "Table22",
          schema: "schema1",
        }),
      ],
    });

    it("should return path for a database with multiple schemas", async () => {
      const value: OmniPickerValue = {
        model: "database",
        id: testDb.id,
      };

      const { result } = setup({
        value,
        databases: [testDb, testDbSingleSchema],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: "databases" },
        { id: testDb.id },
        { id: "schema1" }, // auto selects first schema
      ]);
    });

    it("should hide schema for a database with one schema", async () => {
      const value: OmniPickerValue = {
        model: "database",
        id: testDbSingleSchema.id,
      };

      const { result } = setup({
        value,
        databases: [testDb, testDbSingleSchema],
      });

      await waitForPathLength(result, 2);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: "databases" },
        { id: testDbSingleSchema.id, model: "database" },
      ]);
    });

    it("should return path for a table in database (multiple schemas)", async () => {
      const table = testDb.tables?.[0];
      const value: OmniPickerValue = {
        model: "table",
        id: table?.id as number,
      };

      const { result } = setup({
        value,
        databases: [testDb, testDbSingleSchema],
      });

      await waitForPathLength(result, 4);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: "databases", model: "collection" },
        { id: testDb.id, model: "database" },
        { id: "schema1", model: "schema" },
        { id: table?.id, model: "table", name: table?.display_name },
      ]);
    });

    it("should return path for a table in database (single schema)", async () => {
      const table = testDbSingleSchema.tables?.[0];

      const { result } = setup({
        value: {
          model: "table",
          id: table?.id as number,
        },
        databases: [testDb, testDbSingleSchema],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: "databases", model: "collection" },
        { id: testDbSingleSchema.id, model: "database" },
        { id: table?.id, model: "table" },
      ]);
    });
  });

  describe("special collections", () => {
    it("should handle user personal collection path", async () => {
      const childCollection = createMockCollection({
        id: 2002,
        name: "Personal child collection",
        location: `/${personalCollection.id}/`,
        is_personal: true,
      });

      setupCollectionItemsEndpoint({
        collection: personalCollection,
        collectionItems: [
          createMockCollectionItem({
            id: childCollection.id as number,
            name: childCollection.name,
            model: "collection",
          }),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 222,
            name: "my card",
            model: "card",
          }),
        ],
      });

      const value: OmniPickerValue = {
        model: "collection",
        id: childCollection.id,
        namespace: null,
      };

      const { result } = setup({
        value,
        collections: [childCollection],
      });

      await waitForPathLength(result, 2);

      const [path] = result.current;
      expect(path.length).toBeGreaterThanOrEqual(2);
      expectPathToMatch(path, [
        { id: personalCollection.id, model: "collection" },
        { id: childCollection.id, model: "collection" },
      ]);
    });

    it("should handle other user personal collection root", async () => {
      const otherPersonal = createMockCollection({
        id: 2003,
        name: "Jane's personal collection",
        location: "/",
        is_personal: true,
        personal_owner_id: 2,
      });

      setupCollectionItemsEndpoint({
        collection: otherPersonal,
        collectionItems: [
          createMockCollectionItem({
            id: 222,
            name: "my card",
            model: "card",
          }),
        ],
      });

      const value: OmniPickerValue = {
        model: "collection",
        id: otherPersonal.id,
        namespace: null,
      };

      const { result } = setup({
        value,
        collections: [otherPersonal],
      });

      await waitForPathLength(result, 2);

      const [path] = result.current;
      expect(path.length).toBeGreaterThanOrEqual(2);
      expectPathToMatch(path, [
        { id: "personal", model: "collection" },
        { id: otherPersonal.id, model: "collection" },
      ]);
    });

    it("should handle nested other user personal collections", async () => {
      const otherPersonal = createMockCollection({
        id: 2002,
        name: "Jane's personal collection",
        location: "/",
        is_personal: true,
        personal_owner_id: 2,
      });

      const nestedPersonal = createMockCollection({
        id: 2003,
        name: "Jane's more personal collection",
        location: "/2002/",
        is_personal: true,
      });

      const moreNestedPersonal = createMockCollection({
        id: 2004,
        name: "Jane's extra nested personal collection",
        location: "/2002/2003/",
        is_personal: true,
      });

      setupCollectionItemsEndpoint({
        collection: otherPersonal,
        collectionItems: [
          createMockCollectionItem({
            ...nestedPersonal,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: nestedPersonal,
        collectionItems: [
          createMockCollectionItem({
            ...moreNestedPersonal,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: moreNestedPersonal,
        collectionItems: [
          createMockCollectionItem({
            id: 222,
            name: "my card",
            model: "card",
          }),
        ],
      });

      const value: OmniPickerValue = {
        model: "collection",
        id: moreNestedPersonal.id,
        namespace: null,
      };

      const { result } = setup({
        value,
        collections: [otherPersonal, nestedPersonal, moreNestedPersonal],
      });

      await waitForPathLength(result, 4);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: "personal", model: "collection" },
        { id: otherPersonal.id, model: "collection" },
        { id: nestedPersonal.id, model: "collection" },
        { id: moreNestedPersonal.id, model: "collection" },
      ]);
    });
  });

  describe("loading states", () => {
    it("should set isLoadingPath to true initially, and false when done loading", async () => {
      const parentCollection = createMockCollection({
        id: 16,
        name: "Parent",
        location: "/",
      });

      const childCollection = createMockCollection({
        id: 26,
        name: "Child",
        location: "/16/",
      });

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            ...parentCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      // doing this manually here to get a delay
      fetchMock.get(
        `path:/api/collection/${parentCollection.id}/items`,
        () => {
          return {
            data: [
              createMockCollectionItem({
                ...childCollection,
                model: "collection",
              } as CollectionItem),
            ],
          };
        },
        { name: `collection-${parentCollection.id}-items`, delay: 50 },
      );

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 123,
            name: "Grandchild card",
            model: "card",
          } as CollectionItem),
          createMockCollectionItem({
            id: 1234,
            name: "Grandchild collection",
            location: "/16/26/",
            model: "collection",
          } as CollectionItem),
        ],
      });

      const value: OmniPickerValue = {
        model: "collection",
        id: childCollection.id,
        namespace: null,
      };

      const { result } = setup({
        value,
        collections: [parentCollection, childCollection],
      });

      await waitFor(() => {
        const [, , { isLoadingPath }] = result.current;
        expect(isLoadingPath).toBe(true);
      });

      await waitFor(() => {
        const [, , { isLoadingPath }] = result.current;
        expect(isLoadingPath).toBe(false);
      });
    });
  });

  describe("setPath functionality", () => {
    it("should provide a setPath function", async () => {
      const { result } = setup();

      await waitFor(() => {
        expect(result.current[2].isLoadingPath).toBe(false);
      });

      const [, setPath] = result.current;
      expect(typeof setPath).toBe("function");
    });
  });

  describe("missing items", () => {
    it("should handle missing database gracefully", async () => {
      const value: OmniPickerValue = {
        model: "database",
        id: 999,
      };

      fetchMock.get("path:/api/database/999/schemas", 404);

      const { result } = setup({ value });

      await waitForPathLength(result, 1);

      const [path] = result.current;
      expectPathToMatch(path, [{ id: "databases" }]);
    });

    it("should handle missing collection gracefully", async () => {
      const missing_collection_id = 5555;

      fetchMock.get(`path:/api/collection/${missing_collection_id}`, 404);
      const { result } = setup({
        value: { model: "collection", id: missing_collection_id },
        collections: [],
      });

      await waitForPathLength(result, 0);

      const [path] = result.current;
      expectPathToMatch(path, []);
    });
  });

  describe("enterprise features", () => {
    beforeEach(() => {
      setupLibraryEndpoints(true);
    });

    it("warmup enterprise plugins", () => {
      // warm up enterprise plugins, without this, tests can time out in CI 😢
      setupLibraryEndpoints(true);
      const { result } = setup({
        enterprise: true,
      });
      expect(result).toBeDefined();
    }, 10_000);

    it("should return transform path with a provided transform collection", async () => {
      const parentCollection = createMockCollection({
        id: 6262,
        name: "My Transforms",
        location: "/",
        namespace: "transforms",
        model: "collection",
        here: ["table", "dataset"],
      } as unknown as Collection);

      const childCollection = createMockCollection({
        id: 6363,
        name: "More Transforms",
        location: "/6262/",
        namespace: "transforms",
        model: "collection",
        collection: parentCollection,
        here: ["table", "dataset"],
      } as unknown as Collection);

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            ...parentCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: parentCollection,
        collectionItems: [
          createMockCollectionItem({
            ...childCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 12345,
            name: "Cool Transform",
            model: "transform",
          } as CollectionItem),
        ],
      });

      const { result } = setup({
        enterprise: true,
        value: { id: childCollection.id, model: "collection" },
        options: { ...defaultOptions },
        collections: [parentCollection, childCollection],
        namespaces: ["transforms"],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: "root", namespace: "transforms", name: "Transforms" },
        { id: parentCollection.id },
        { id: childCollection.id },
      ]);
    });

    it("should return library collection path with no provided value", async () => {
      const libraryCollection = createMockCollection({
        id: 6464,
        name: "Library",
        here: ["collection"],
        below: ["collection"],
      } as unknown as Collection);

      const childCollection = createMockCollection({
        id: 6565,
        name: "Data",
        location: "/6464/",
        here: ["table", "dataset"],
      } as unknown as Collection);

      setupCollectionItemsEndpoint({
        collection: libraryCollection,
        collectionItems: [
          createMockCollectionItem({
            ...childCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      const { result } = setup({
        enterprise: true,
        options: { ...defaultOptions, hasLibrary: true },
        collections: [libraryCollection, childCollection],
      });

      await waitForPathLength(result, 2);

      const [path] = result.current;
      expectPathToMatch(path, [
        { id: libraryCollection.id },
        { id: childCollection.id },
      ]);
    });

    it("should return a shared tenant collection path", async () => {
      const parentCollection = createMockCollection({
        id: 6262,
        name: "shared stuff",
        location: "/",
        namespace: "shared-tenant-collection",
        model: "collection",
        here: ["table", "dataset", "collection"],
      } as unknown as Collection);

      const childCollection = createMockCollection({
        id: 6363,
        name: "More shared stuff",
        location: "/6262/",
        namespace: "shared-tenant-collection",
        model: "collection",
        collection: parentCollection,
        here: ["table", "dataset", "collection"],
      } as unknown as Collection);

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            ...parentCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: parentCollection,
        collectionItems: [
          createMockCollectionItem({
            ...childCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 12345,
            name: "Cool Card",
            model: "card",
          } as CollectionItem),
        ],
      });

      const { result } = setup({
        enterprise: true,
        value: { id: childCollection.id, model: "collection" },
        options: { ...defaultOptions },
        collections: [parentCollection, childCollection],
        namespaces: ["transforms"],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        {
          id: "root",
          namespace: "shared-tenant-collection",
          name: "Shared collections",
        },
        { id: parentCollection.id },
        { id: childCollection.id },
      ]);
    });

    it("should return a tenant specific collection path", async () => {
      const parentCollection = createMockCollection({
        id: 6262,
        name: "specific stuff",
        location: "/",
        namespace: "tenant-specific",
        model: "collection",
        here: ["table", "dataset", "collection"],
      } as unknown as Collection);

      const childCollection = createMockCollection({
        id: 6363,
        name: "More specific stuff",
        location: "/6262/",
        namespace: "tenant-specific",
        model: "collection",
        collection: parentCollection,
        here: ["table", "dataset", "collection"],
      } as unknown as Collection);

      setupCollectionItemsEndpoint({
        collection: { id: "root" },
        collectionItems: [
          createMockCollectionItem({
            ...parentCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: parentCollection,
        collectionItems: [
          createMockCollectionItem({
            ...childCollection,
            model: "collection",
          } as CollectionItem),
        ],
      });

      setupCollectionItemsEndpoint({
        collection: childCollection,
        collectionItems: [
          createMockCollectionItem({
            id: 12345,
            name: "Cool Card",
            model: "card",
          } as CollectionItem),
        ],
      });

      const { result } = setup({
        enterprise: true,
        value: { id: childCollection.id, model: "collection" },
        options: { ...defaultOptions },
        collections: [parentCollection, childCollection],
        namespaces: ["transforms"],
      });

      await waitForPathLength(result, 3);

      const [path] = result.current;
      expectPathToMatch(path, [
        {
          id: "root",
          namespace: "tenant-specific",
          name: "Tenant collections",
        },
        { id: parentCollection.id },
        { id: childCollection.id },
      ]);
    });
  });
});

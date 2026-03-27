import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { CollectionContentModel, TokenFeatures } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockSearchResult,
  createMockSettings,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MiniPicker, type MiniPickerProps } from "..";

const collectionItemModels = [
  "dataset",
  "metric",
  "card",
] as CollectionContentModel[];

export const setup = async (
  props: Partial<MiniPickerProps> = {},
  {
    tokenFeatures = null,
    hasAccessToRoot = true,
  }: { tokenFeatures?: TokenFeatures | null; hasAccessToRoot?: boolean } = {},
) => {
  const onChangeSpy = jest.fn();
  const onCloseSpy = jest.fn();

  mockGetBoundingClientRect(); // for virtualization
  const db = createMockDatabase({
    name: "Mini Db",
    id: 1,
    tables: [
      createMockTable({
        id: 1,
        db_id: 1,
        display_name: "weather",
        schema: "public",
      }),
      createMockTable({
        id: 2,
        db_id: 1,
        display_name: "roads",
        schema: "public",
      }),
      createMockTable({
        id: 3,
        db_id: 1,
        display_name: "pokedex",
        schema: "pokemon",
      }),
      createMockTable({
        id: 4,
        db_id: 1,
        display_name: "cards",
        schema: "pokemon",
      }),
      createMockTable({
        id: 5,
        db_id: 1,
        display_name: "digimon",
        schema: "digimon",
      }),
    ],
  });

  const db2 = createMockDatabase({
    name: "Solo Db",
    id: 2,
    tables: [
      createMockTable({
        id: 6,
        db_id: 2,
        display_name: "pride",
        schema: "only",
      }),
      createMockTable({
        id: 7,
        db_id: 2,
        display_name: "prejudice",
        schema: "only",
      }),
    ],
  });

  const db3 = createMockDatabase({
    name: "NoSchema Db",
    id: 3,
    tables: [
      createMockTable({ id: 8, db_id: 3, display_name: "jane", schema: "" }),
      createMockTable({
        id: 9,
        db_id: 3,
        display_name: "elizabeth",
        schema: "",
      }),
      createMockTable({ id: 10, db_id: 3, display_name: "mary", schema: "" }),
      createMockTable({ id: 11, db_id: 3, display_name: "kitty", schema: "" }),
      createMockTable({ id: 12, db_id: 3, display_name: "lydia", schema: "" }),
    ],
  });
  setupDatabasesEndpoints([db, db2, db3]);

  const ROOT_COLLECTION = createMockCollection({
    id: "root",
    name: "Our analytics",
  });

  setupCollectionByIdEndpoint({
    collections: [ROOT_COLLECTION],
    error: hasAccessToRoot ? undefined : "You can't do that Ryan",
  });

  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: "root", name: "Our analytics" }),
    collectionItems: [
      createMockCollectionItem({
        id: 101,
        model: "collection",
        name: "more things",
        collection_id: "root",
        here: collectionItemModels,
      }),
      createMockCollectionItem({
        id: 102,
        model: "card",
        name: "Brighton",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 103,
        model: "dataset",
        name: "Pemberly",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 104,
        model: "document",
        name: "Longbourn",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 105,
        model: "dashboard",
        name: "NetherField",
        collection_id: "root",
      }),
      createMockCollectionItem({
        id: 106,
        model: "metric",
        name: "Catherine",
        collection_id: "root",
      }),
    ],
  });

  setupCollectionItemsEndpoint({
    collection: createMockCollection({
      id: 101,
      name: "more things",
      here: collectionItemModels,
    }),
    collectionItems: [
      createMockCollectionItem({
        id: 201,
        model: "collection",
        name: "even more things",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 202,
        model: "card",
        name: "Rosings",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 203,
        model: "dataset",
        name: "Meryton",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 204,
        model: "document",
        name: "Lambton",
        collection_id: 101,
      }),
      createMockCollectionItem({
        id: 205,
        model: "dashboard",
        name: "Hunsford",
        collection_id: 101,
      }),
    ],
    models: ["card", "dataset", "document", "dashboard", "collection"],
  });

  setupSearchEndpoints([
    createMockSearchResult({ id: 301, model: "card", name: "Lucas" }),
    createMockSearchResult({ id: 302, model: "dataset", name: "Forster" }),
    createMockSearchResult({
      id: 303,
      model: "metric",
      name: "Bingley",
      collection: {
        id: 789,
        name: "Misc Metrics",
        archived: false,
      },
    }),
    createMockSearchResult({
      id: 303,
      model: "table",
      name: "Kitty",
      database_name: "big_secret",
      table_schema: "also_secret",
      collection: {
        id: 7891,
        name: "Misc Tables",
        archived: false,
      },
    }),
    createMockSearchResult({ id: 304, model: "document", name: "Wickham" }),
    createMockSearchResult({ id: 305, model: "collection", name: "Reynolds" }),
    createMockSearchResult({
      id: 306,
      model: "metric",
      name: "Fanny",
      collection: {
        // @ts-expect-error - can be null in search results
        id: null,
        // @ts-expect-error - can be null in search results
        name: null,
      },
    }),
    createMockSearchResult({
      id: 401,
      model: "table",
      name: "wickham",
      table_schema: "lydia",
      database_name: "london",
      collection: {
        // @ts-expect-error - can be null in search results
        id: null,
        // @ts-expect-error - can be null in search results
        name: null,
      },
    }),
  ]);

  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"], {}, true);

  const settings = tokenFeatures
    ? mockSettings(
        createMockSettings({
          "token-features": createMockTokenFeatures(tokenFeatures),
        }),
      )
    : {};

  if (tokenFeatures) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <MiniPicker
      opened
      models={["table", "dataset", "metric", "card"]}
      onClose={onCloseSpy}
      onChange={onChangeSpy}
      {...props}
    />,
    { storeInitialState: settings },
  );
  expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();

  return { onChangeSpy, onCloseSpy };
};

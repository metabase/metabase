import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupListDataAppsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { defer } from "metabase/utils/promise";
import { EnterpriseApi } from "metabase-enterprise/api";
import { listTag } from "metabase-enterprise/api/tags";
import type {
  CollectionItem,
  DataApp,
  DependencyEntry,
  DependencyNode,
} from "metabase-types/api";
import {
  createMockActionDependencyNode,
  createMockActionDependencyNodeData,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCollection,
  createMockCollectionItem,
  createMockDataApp,
  createMockDataAppDependencyNode,
  createMockDatabase,
  createMockSearchResult,
  createMockSnippetDependencyNode,
  createMockSnippetDependencyNodeData,
  createMockTable,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTokenFeatures,
  createMockTransformDependencyNode,
  createMockTransformDependencyNodeData,
} from "metabase-types/api/mocks";

import { EntryPickerModal } from "./EntryPickerModal";

const OWLS = createMockDataApp({ id: 8, slug: "owls", name: "Owls" });

// The current user's personal collection, which the picker fetches for its root list.
const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: 1,
});

type SetupOpts = {
  dataApps?: DataApp[];
  hasDataAppsFeature?: boolean;
  value?: DependencyNode | null;
};

function setup({
  dataApps = [OWLS],
  hasDataAppsFeature = true,
  value = null,
}: SetupOpts = {}) {
  mockGetBoundingClientRect();
  setupListDataAppsEndpoint(dataApps);
  setupDatabasesEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection({ id: "root", name: "Our analytics" }),
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        "data-apps": hasDataAppsFeature,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("data-apps");

  const onChange = jest.fn<void, [DependencyEntry]>();
  const { store } = renderWithProviders(
    <EntryPickerModal value={value} onChange={onChange} onClose={jest.fn()} />,
    { storeInitialState: state },
  );
  return { onChange, store };
}

describe("EntryPickerModal", () => {
  afterEach(() => {
    reinitialize();
  });

  it("picks a data app from the Data apps folder as the entry", async () => {
    const { onChange } = setup();

    await userEvent.click(await screen.findByText("Data apps"));
    await userEvent.click(await screen.findByText("Owls"));

    expect(onChange).toHaveBeenCalledWith({ id: 8, type: "data-app" });
  });

  it("shows the root list only after the app list loads, then opens on the data app", async () => {
    const appsResponse = defer<DataApp[]>();
    fetchMock.get("path:/api/ee/apps", () => appsResponse.promise);
    setup({ value: createMockDataAppDependencyNode({ id: OWLS.id }) });

    // The root collection is the last thing the root list asks for besides the app list.
    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/collection/root")).toBe(
        true,
      );
    });
    await expect(
      screen.findByRole("link", { name: /Our analytics/ }, { timeout: 500 }),
    ).rejects.toThrow();

    appsResponse.resolve([OWLS]);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Owls/ })).toHaveAttribute(
        "data-active",
        "true",
      );
    });
  });

  it("keeps the folder the user opened when the app list changes", async () => {
    let dataApps = [OWLS];
    fetchMock.get("path:/api/ee/apps", () => dataApps);
    const { store } = setup({
      value: createMockDataAppDependencyNode({ id: OWLS.id }),
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Owls/ })).toHaveAttribute(
        "data-active",
        "true",
      );
    });
    await userEvent.click(screen.getByRole("link", { name: /Our analytics/ }));
    dataApps = [];
    act(() => {
      store.dispatch(EnterpriseApi.util.invalidateTags([listTag("data-app")]));
    });

    await waitFor(() => {
      expect(screen.queryByText("Data apps")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Our analytics/ })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("has no Data apps folder without the data apps feature", async () => {
    setup({ hasDataAppsFeature: false });

    await screen.findByText("Our analytics");
    expect(screen.queryByText("Data apps")).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/ee/apps", { method: "GET" }),
    ).toBe(false);
  });
});

const SAMPLE_DATABASE_ID = 1;
const PRODUCTS = createMockTable({
  id: 2,
  db_id: SAMPLE_DATABASE_ID,
  schema: "PUBLIC",
  name: "PRODUCTS",
  display_name: "Products",
});
const ORDERS = createMockTable({
  id: 1,
  db_id: SAMPLE_DATABASE_ID,
  schema: "PUBLIC",
  name: "ORDERS",
  display_name: "Orders",
});
const SAMPLE_DATABASE = createMockDatabase({
  id: SAMPLE_DATABASE_ID,
  name: "Sample Database",
  tables: [ORDERS, PRODUCTS],
});
const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  location: "",
  can_write: true,
});
const DATA_ACTIONS_FOLDER_ID = 4;
const DATA_ACTIONS_FOLDER = createMockCollection({
  id: DATA_ACTIONS_FOLDER_ID,
  name: "Data actions folder",
  namespace: "data-actions",
  location: "/",
  here: ["action"],
  below: [],
});

type PickerItem = {
  name: string;
  item: CollectionItem;
  node: DependencyNode;
  entry: DependencyEntry;
};

const ORDERS_COUNT_QUESTION: PickerItem = {
  name: "Orders, Count, Grouped by Created At (year)",
  item: createMockCollectionItem({
    id: 12,
    model: "card",
    name: "Orders, Count, Grouped by Created At (year)",
    display: "line",
    collection_id: null,
  }),
  node: createMockCardDependencyNode({
    id: 12,
    data: createMockCardDependencyNodeData({
      name: "Orders, Count, Grouped by Created At (year)",
      type: "question",
      display: "line",
    }),
  }),
  entry: { id: 12, type: "card" },
};
const ORDERS_MODEL: PickerItem = {
  name: "Orders Model",
  item: createMockCollectionItem({
    id: 13,
    model: "dataset",
    name: "Orders Model",
    collection_id: null,
  }),
  node: createMockCardDependencyNode({
    id: 13,
    data: createMockCardDependencyNodeData({
      name: "Orders Model",
      type: "model",
    }),
  }),
  entry: { id: 13, type: "card" },
};
const TABLE_BASED_METRIC: PickerItem = {
  name: "Table-based metric",
  item: createMockCollectionItem({
    id: 14,
    model: "metric",
    name: "Table-based metric",
    collection_id: null,
  }),
  node: createMockCardDependencyNode({
    id: 14,
    data: createMockCardDependencyNodeData({
      name: "Table-based metric",
      type: "metric",
    }),
  }),
  entry: { id: 14, type: "card" },
};
const TABLE_BASED_TRANSFORM: PickerItem = {
  name: "Table-based transform",
  item: createMockCollectionItem({
    id: 15,
    model: "transform",
    name: "Table-based transform",
    collection_id: null,
  }),
  node: createMockTransformDependencyNode({
    id: 15,
    data: createMockTransformDependencyNodeData({
      name: "Table-based transform",
    }),
  }),
  entry: { id: 15, type: "transform" },
};
const EMPTY_SNIPPET: PickerItem = {
  name: "Empty snippet",
  item: createMockCollectionItem({
    id: 16,
    model: "snippet",
    name: "Empty snippet",
    collection_id: null,
  }),
  node: createMockSnippetDependencyNode({
    id: 16,
    data: createMockSnippetDependencyNodeData({ name: "Empty snippet" }),
  }),
  entry: { id: 16, type: "snippet" },
};
const TABLE_BASED_ACTION: PickerItem = {
  name: "Table-based data action",
  item: createMockCollectionItem({
    id: 17,
    model: "action",
    name: "Table-based data action",
    collection_id: DATA_ACTIONS_FOLDER_ID,
  }),
  node: createMockActionDependencyNode({
    id: 17,
    data: createMockActionDependencyNodeData({
      name: "Table-based data action",
      model_id: null,
      collection_id: DATA_ACTIONS_FOLDER_ID,
      collection: DATA_ACTIONS_FOLDER,
    }),
  }),
  entry: { id: 17, type: "action" },
};
const PRODUCTS_TABLE: PickerItem = {
  name: "Products",
  item: createMockCollectionItem({ id: PRODUCTS.id, model: "table" }),
  node: createMockTableDependencyNode({
    id: PRODUCTS.id,
    data: createMockTableDependencyNodeData({
      name: PRODUCTS.name,
      display_name: PRODUCTS.display_name,
      db_id: SAMPLE_DATABASE.id,
      schema: "PUBLIC",
    }),
  }),
  entry: { id: PRODUCTS.id, type: "table" },
};

const ROOT_ITEMS = [ORDERS_COUNT_QUESTION, ORDERS_MODEL, TABLE_BASED_METRIC];

function getCollectionItemsResponse(items: CollectionItem[]) {
  return {
    data: items,
    total: items.length,
    models: [],
    limit: null,
    offset: null,
  };
}

function setupEntityTypes() {
  mockGetBoundingClientRect();
  setupListDataAppsEndpoint([]);
  setupDatabasesEndpoints([SAMPLE_DATABASE]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  fetchMock.get("path:/api/collection/root", (call) => {
    const namespace = new URL(call.url).searchParams.get("namespace");
    return { ...ROOT_COLLECTION, namespace };
  });
  fetchMock.get("path:/api/collection/root/items", (call) => {
    const namespace = new URL(call.url).searchParams.get("namespace");
    switch (namespace) {
      case "transforms":
        return getCollectionItemsResponse([TABLE_BASED_TRANSFORM.item]);
      case "snippets":
        return getCollectionItemsResponse([EMPTY_SNIPPET.item]);
      case "data-actions":
        return getCollectionItemsResponse([
          createMockCollectionItem({
            id: DATA_ACTIONS_FOLDER_ID,
            model: "collection",
            name: DATA_ACTIONS_FOLDER.name,
            namespace: "data-actions",
            here: ["action"],
            below: [],
            location: "/",
          }),
        ]);
      case null:
        return getCollectionItemsResponse(ROOT_ITEMS.map(({ item }) => item));
      default:
        return getCollectionItemsResponse([]);
    }
  });
  setupCollectionByIdEndpoint({
    collections: [PERSONAL_COLLECTION, DATA_ACTIONS_FOLDER],
  });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: DATA_ACTIONS_FOLDER,
    collectionItems: [TABLE_BASED_ACTION.item],
  });
  fetchMock.get("path:/api/collection", [PERSONAL_COLLECTION]);
  setupCardEndpoints(ORDERS_COUNT_QUESTION, ORDERS_MODEL, TABLE_BASED_METRIC);
  fetchMock.get(`path:/api/transform/${TABLE_BASED_TRANSFORM.entry.id}`, {
    id: TABLE_BASED_TRANSFORM.entry.id,
    name: TABLE_BASED_TRANSFORM.name,
    collection_id: null,
  });
  fetchMock.get(`path:/api/native-query-snippet/${EMPTY_SNIPPET.entry.id}`, {
    id: EMPTY_SNIPPET.entry.id,
    name: EMPTY_SNIPPET.name,
    collection_id: null,
  });
  fetchMock.get(`path:/api/action/${TABLE_BASED_ACTION.entry.id}`, {
    id: TABLE_BASED_ACTION.entry.id,
    name: TABLE_BASED_ACTION.name,
    collection_id: DATA_ACTIONS_FOLDER.id,
    collection: DATA_ACTIONS_FOLDER,
  });
}

function setupCardEndpoints(...items: PickerItem[]) {
  items.forEach(({ item }) => {
    fetchMock.get(`path:/api/card/${item.id}`, {
      id: item.id,
      name: item.name,
      type:
        item.model === "dataset"
          ? "model"
          : item.model === "metric"
            ? "metric"
            : "question",
      collection_id: null,
    });
  });
}

function renderEntityTypePicker(value: DependencyNode | null = null) {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        "transforms-basic": true,
        dependencies: true,
      }),
    }),
  });
  const onChange = jest.fn<void, [DependencyEntry]>();
  renderWithProviders(
    <EntryPickerModal value={value} onChange={onChange} onClose={jest.fn()} />,
    { storeInitialState: state },
  );
  return { onChange };
}

async function pickPath(path: string[]) {
  for (const name of path) {
    await userEvent.click(
      await screen.findByRole("link", { name: new RegExp(escapeRegExp(name)) }),
    );
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("EntryPickerModal entity types", () => {
  it.each<{ path: string[]; target: PickerItem }>([
    {
      path: ["Databases", "Sample Database", "Products"],
      target: PRODUCTS_TABLE,
    },
    {
      path: ["Our analytics", ORDERS_COUNT_QUESTION.name],
      target: ORDERS_COUNT_QUESTION,
    },
    { path: ["Our analytics", ORDERS_MODEL.name], target: ORDERS_MODEL },
    {
      path: ["Our analytics", TABLE_BASED_METRIC.name],
      target: TABLE_BASED_METRIC,
    },
    {
      path: ["Transforms", TABLE_BASED_TRANSFORM.name],
      target: TABLE_BASED_TRANSFORM,
    },
    { path: ["SQL Snippets", EMPTY_SNIPPET.name], target: EMPTY_SNIPPET },
    {
      path: ["Data actions", DATA_ACTIONS_FOLDER.name, TABLE_BASED_ACTION.name],
      target: TABLE_BASED_ACTION,
    },
  ])("picks $target.name as the entry", async ({ path, target }) => {
    setupEntityTypes();
    const { onChange } = renderEntityTypePicker();

    await pickPath(path);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(target.entry);
  });

  it.each<{ target: PickerItem }>([
    { target: PRODUCTS_TABLE },
    { target: ORDERS_COUNT_QUESTION },
    { target: ORDERS_MODEL },
    { target: TABLE_BASED_METRIC },
    { target: TABLE_BASED_TRANSFORM },
    { target: EMPTY_SNIPPET },
    { target: TABLE_BASED_ACTION },
  ])("opens on $target.name when it is the entry", async ({ target }) => {
    setupEntityTypes();
    renderEntityTypePicker(target.node);

    await waitFor(() => {
      expect(
        screen.getByRole("link", {
          name: new RegExp(escapeRegExp(target.name)),
        }),
      ).toHaveAttribute("data-active", "true");
    });
  });
});

async function findSearchResult(name: string) {
  return waitFor(() => {
    const results = screen
      .getAllByRole("link", { name: new RegExp(escapeRegExp(name)) })
      .filter((link) => !link.textContent?.includes("Search results for"));
    expect(results).toHaveLength(1);
    return results[0];
  });
}

describe("EntryPickerModal entity search", () => {
  const SEARCH_RESULTS = [
    createMockSearchResult({
      id: PRODUCTS.id,
      name: "Products",
      model: "table",
      database_id: SAMPLE_DATABASE_ID,
      table_id: PRODUCTS.id,
    }),
    createMockSearchResult({
      id: ORDERS_COUNT_QUESTION.entry.id,
      name: ORDERS_COUNT_QUESTION.name,
      model: "card",
      display: "line",
    }),
    createMockSearchResult({
      id: ORDERS_MODEL.entry.id,
      name: ORDERS_MODEL.name,
      model: "dataset",
    }),
    createMockSearchResult({
      id: TABLE_BASED_METRIC.entry.id,
      name: TABLE_BASED_METRIC.name,
      model: "metric",
    }),
    createMockSearchResult({
      id: TABLE_BASED_TRANSFORM.entry.id,
      name: TABLE_BASED_TRANSFORM.name,
      model: "transform",
    }),
  ];

  it.each<{ target: PickerItem; model: string }>([
    { target: PRODUCTS_TABLE, model: "table" },
    { target: ORDERS_COUNT_QUESTION, model: "card" },
    { target: ORDERS_MODEL, model: "dataset" },
    { target: TABLE_BASED_METRIC, model: "metric" },
    { target: TABLE_BASED_TRANSFORM, model: "transform" },
  ])(
    "finds $target.name in the picker search everywhere and picks it as the entry",
    async ({ target, model }) => {
      setupEntityTypes();
      setupSearchEndpoints(SEARCH_RESULTS);
      const { onChange } = renderEntityTypePicker();

      await userEvent.type(
        await screen.findByPlaceholderText(/Search/),
        target.name,
      );
      expect(await screen.findByText(/results for/)).toBeInTheDocument();
      await userEvent.click(
        within(await screen.findByTestId("search-scope-selector")).getByText(
          "Everywhere",
        ),
      );
      await userEvent.click(await findSearchResult(target.name));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(target.entry);
      const searchParams = new URL(
        fetchMock.callHistory.lastCall("path:/api/search")!.url,
      ).searchParams;
      expect(searchParams.get("q")).toBe(target.name);
      expect(searchParams.getAll("models")).toContain(model);
    },
  );
});

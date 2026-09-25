import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionTreeEndpoint,
  setupNativeQuerySnippetEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { LibraryPage } from "./LibraryPage";

jest.mock("metabase/common/components/Pickers/EntityPicker", () => ({
  ...jest.requireActual(
    "metabase/common/components/Pickers/EntityPicker/types",
  ),
  EntityPickerModal: () => <div data-testid="entity-picker-modal" />,
}));

const DATA_EMPTY_STATE =
  "Cleaned, pre-transformed data sources ready for exploring";
const METRICS_EMPTY_STATE = "Standardized calculations with known dimensions";
const SNIPPETS_EMPTY_STATE = "Reusable bits of code that save your time";

const DATA_COLLECTION = createMockCollection({
  id: 2,
  name: "Data",
  type: "library-data",
  location: "/1/",
  can_write: true,
});

const METRICS_COLLECTION = createMockCollection({
  id: 3,
  name: "Metrics",
  type: "library-metrics",
  location: "/1/",
  can_write: true,
});

const LIBRARY_COLLECTION = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
  can_write: true,
  children: [DATA_COLLECTION, METRICS_COLLECTION],
});

type SetupOpts = {
  dataItems?: CollectionItem[];
  isRemoteSyncReadOnly?: boolean;
};

function setup({
  dataItems = [],
  isRemoteSyncReadOnly = false,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 40 });
  setupCollectionTreeEndpoint([LIBRARY_COLLECTION]);
  setupCollectionItemsEndpoint({
    collection: DATA_COLLECTION,
    collectionItems: dataItems,
  });
  setupCollectionItemsEndpoint({
    collection: METRICS_COLLECTION,
    collectionItems: [],
  });
  fetchMock.get("path:/api/collection", [
    createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
  ]);
  setupNativeQuerySnippetEndpoints();
  setupSearchEndpoints([]);

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: true,
      permissions: {
        can_create_queries: true,
        can_create_native_queries: true,
      },
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        library: true,
        snippet_collections: true,
        remote_sync: true,
      }),
      "remote-sync-enabled": isRemoteSyncReadOnly,
      "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : "read-write",
    }),
  });
  setupEnterprisePlugins();

  renderWithProviders(<LibraryPage />, {
    storeInitialState: state,
    withRouter: true,
  });
}

function getEmptyStateRow(description: string) {
  const rows = screen.getAllByTestId("empty-state-row");
  const row = rows.find((row) => row.textContent?.includes(description));
  if (!row) {
    throw new Error(`No empty state row for "${description}"`);
  }
  return within(row);
}

const ORDERS_TABLE_ITEM = createMockCollectionItem({
  id: 10,
  model: "table",
  name: "Orders",
});

describe("LibraryPage", () => {
  it("shows an empty state with an action in every empty section", async () => {
    setup();

    expect(await screen.findAllByTestId("empty-state-row")).toHaveLength(3);
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getByText("Metrics")).toBeInTheDocument();
    expect(screen.getByText("SQL snippets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New/ })).toBeInTheDocument();

    const dataRow = getEmptyStateRow(DATA_EMPTY_STATE);
    expect(
      dataRow.getByRole("button", { name: "Publish a table" }),
    ).toBeInTheDocument();

    const metricsRow = getEmptyStateRow(METRICS_EMPTY_STATE);
    expect(metricsRow.getByRole("link", { name: "New metric" })).toHaveAttribute(
      "href",
      expect.stringContaining(`collectionId=${METRICS_COLLECTION.id}`),
    );

    const snippetsRow = getEmptyStateRow(SNIPPETS_EMPTY_STATE);
    expect(
      snippetsRow.getByRole("link", { name: "New snippet" }),
    ).toBeInTheDocument();
  });

  it("opens the table picker from the Data empty state action", async () => {
    setup();

    expect(await screen.findAllByTestId("empty-state-row")).toHaveLength(3);
    const dataRow = getEmptyStateRow(DATA_EMPTY_STATE);
    expect(screen.queryByTestId("entity-picker-modal")).not.toBeInTheDocument();

    await userEvent.click(
      dataRow.getByRole("button", { name: "Publish a table" }),
    );

    expect(await screen.findByTestId("entity-picker-modal")).toBeInTheDocument();
  });

  it("excludes empty states from search results", async () => {
    setup();

    expect(await screen.findAllByTestId("empty-state-row")).toHaveLength(3);

    await userEvent.type(screen.getByPlaceholderText("Search..."), "Publish");

    expect(
      await screen.findByText("No tables, metrics, or snippets yet"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state-row")).not.toBeInTheDocument();
    expect(screen.queryByText(DATA_EMPTY_STATE)).not.toBeInTheDocument();
  });

  it("shows row checkboxes and drops the empty state of a section with items", async () => {
    setup({ dataItems: [ORDERS_TABLE_ITEM] });

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
    expect(screen.getByText(METRICS_EMPTY_STATE)).toBeInTheDocument();
    expect(screen.queryByText(DATA_EMPTY_STATE)).not.toBeInTheDocument();
  });

  describe("remote-sync read-only mode", () => {
    it("hides +New and every empty state action but keeps the descriptions", async () => {
      setup({ isRemoteSyncReadOnly: true });

      expect(await screen.findAllByTestId("empty-state-row")).toHaveLength(3);
      expect(screen.getByText("SQL snippets")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /New/ }),
      ).not.toBeInTheDocument();

      [DATA_EMPTY_STATE, METRICS_EMPTY_STATE, SNIPPETS_EMPTY_STATE].forEach(
        (description) => {
          const row = getEmptyStateRow(description);
          expect(row.getByText(description)).toBeInTheDocument();
          expect(row.queryByRole("button")).not.toBeInTheDocument();
          expect(row.queryByRole("link")).not.toBeInTheDocument();
        },
      );
    });

    it("hides row checkboxes", async () => {
      setup({ dataItems: [ORDERS_TABLE_ITEM], isRemoteSyncReadOnly: true });

      expect(await screen.findByText("Orders")).toBeInTheDocument();
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });
  });
});

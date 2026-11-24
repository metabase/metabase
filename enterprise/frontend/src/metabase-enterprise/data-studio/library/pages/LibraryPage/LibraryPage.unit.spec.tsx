import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUnauthorizedCollectionEndpoints,
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
import { collectionApi } from "metabase/api";
import { listTag } from "metabase/api/tags";
import type { CollectionPickerModalProps } from "metabase/common/components/Pickers/CollectionPicker/CollectionPickerModal";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  EnterpriseSettings,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { LibraryPage } from "./LibraryPage";

jest.mock("metabase/common/components/Pickers", () => ({
  ...jest.requireActual("metabase/common/components/Pickers"),
  CollectionPickerModal: ({ onChange }: CollectionPickerModalProps) => (
    <button
      onClick={() =>
        onChange({
          id: 6,
          name: "Finance folder",
          model: "collection",
          can_write: true,
        })
      }
    >
      Destination
    </button>
  ),
}));

const DATA_COLLECTION = createMockCollection({
  id: 2,
  name: "Data",
  type: "library-data",
  can_write: true,
});

const LIBRARY_COLLECTION = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
  children: [DATA_COLLECTION],
});

const FOLDER = createMockCollectionItem({
  id: 5,
  name: "Sales folder",
  model: "collection",
  type: "library-data",
  here: ["table"],
  can_write: true,
});

const DESTINATION_FOLDER = createMockCollectionItem({
  id: 6,
  name: "Finance folder",
  model: "collection",
  type: "library-data",
});

const createTableItem = (
  id: number,
  name: string,
  collectionId: CollectionId = FOLDER.id,
) =>
  createMockCollectionItem({
    id,
    name,
    model: "table",
    database_id: 1,
    collection_id: collectionId,
    can_write: true,
  });

const ORDERS = createTableItem(10, "Orders");

function setupItems(
  collection: Pick<Collection, "id">,
  collectionItems: CollectionItem[],
) {
  fetchMock.removeRoute(`collection-${collection.id}-items`);
  fetchMock.removeRoute(`collection-${collection.id}-items-metadata`);
  setupCollectionItemsEndpoint({ collection, collectionItems });
}

function setupFolderItems(collectionItems: CollectionItem[]) {
  setupItems(FOLDER, collectionItems);
}

type SetupOpts = {
  destinationItems?: CollectionItem[];
  folderItems?: CollectionItem[];
  isFolderReadable?: boolean;
};

function setup({
  destinationItems = [],
  folderItems = [ORDERS],
  isFolderReadable = true,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 1000 });
  setupCollectionsEndpoints({ collections: [LIBRARY_COLLECTION] });
  setupItems(DATA_COLLECTION, [
    { ...FOLDER, here: folderItems.map((item) => item.model) },
    {
      ...DESTINATION_FOLDER,
      here: destinationItems.length > 0 ? ["table"] : [],
    },
  ]);
  if (isFolderReadable) {
    setupFolderItems(folderItems);
  } else {
    setupUnauthorizedCollectionEndpoints(
      createMockCollection({ id: FOLDER.id }),
    );
  }
  setupItems(DESTINATION_FOLDER, destinationItems);
  setupTableEndpoints(createMockTable({ id: ORDERS.id }));
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
    currentUser: createMockUser({ is_superuser: true }),
  });
  setupEnterprisePlugins();

  return renderWithProviders(<Route path="/" element={<LibraryPage />} />, {
    withRouter: true,
    storeInitialState: state,
  });
}

function setupMovedOrders(destinationItems: CollectionItem[]) {
  setupItems(DATA_COLLECTION, [
    { ...FOLDER, here: [] },
    { ...DESTINATION_FOLDER, here: ["table"] },
  ]);
  setupFolderItems([]);
  setupItems(DESTINATION_FOLDER, [
    ...destinationItems,
    createTableItem(ORDERS.id, ORDERS.name, DESTINATION_FOLDER.id),
  ]);
}

describe("LibraryPage", () => {
  it("updates an expanded folder when its items change", async () => {
    const { store } = setup();

    await userEvent.click(await screen.findByText("Sales folder"));
    expect(await screen.findByText("Orders")).toBeInTheDocument();

    setupFolderItems([createTableItem(11, "Invoices")]);
    act(() => {
      store.dispatch(collectionApi.util.invalidateTags([listTag("table")]));
    });

    expect(await screen.findByText("Invoices")).toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
  });

  it("shows tables moved in bulk into an expanded folder", async () => {
    const invoices = createTableItem(11, "Invoices", DESTINATION_FOLDER.id);
    setup({ destinationItems: [invoices] });

    await userEvent.click(await screen.findByText("Finance folder"));
    expect(await screen.findByText("Invoices")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Sales folder"));
    await userEvent.click(
      within(await screen.findByRole("row", { name: /Orders/ })).getByRole(
        "checkbox",
      ),
    );
    await userEvent.click(screen.getByText("Sales folder"));
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();

    setupMovedOrders([invoices]);
    await userEvent.click(
      within(screen.getByTestId("toast-card")).getByRole("button", {
        name: "Move",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Destination" }),
    );

    expect(await screen.findByText("Orders")).toBeInTheDocument();
  });

  it("shows a table moved into an empty folder", async () => {
    setup();

    await userEvent.click(await screen.findByText("Sales folder"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Show table options" }),
    );
    setupMovedOrders([]);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Move/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Destination" }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Expand" }),
    );
    expect(await screen.findByText("Orders")).toBeInTheDocument();
  });

  it("stops loading a folder whose items fail to load", async () => {
    setup({ isFolderReadable: false });

    await userEvent.click(await screen.findByText("Sales folder"));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(`path:/api/collection/${FOLDER.id}/items`),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument(),
    );
  });

  it("requests the items of an expanded folder once", async () => {
    setup();

    await userEvent.click(await screen.findByText("Sales folder"));
    expect(await screen.findByText("Orders")).toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls(`collection-${FOLDER.id}-items`),
    ).toHaveLength(1);
  });

  it("subsumes the descendants of a selected folder and moves only the folder", async () => {
    const childFolder = createMockCollectionItem({
      id: 7,
      name: "Child folder",
      model: "collection",
      type: "library-data",
      location: `/${LIBRARY_COLLECTION.id}/${DATA_COLLECTION.id}/${FOLDER.id}/`,
      can_write: true,
    });
    setup({ folderItems: [ORDERS, childFolder] });
    fetchMock.put(`path:/api/collection/${FOLDER.id}`, (call) => ({
      ...FOLDER,
      ...JSON.parse(String(call.options.body)),
    }));
    fetchMock.put(`path:/api/table/${ORDERS.id}`, { status: 200, body: {} });

    await userEvent.click(await screen.findByText("Sales folder"));
    await userEvent.click(
      within(await screen.findByRole("row", { name: /Orders/ })).getByRole(
        "checkbox",
        { name: "Select row" },
      ),
    );
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("row", { name: /Sales folder/ })).getByRole(
        "checkbox",
        { name: "Select row" },
      ),
    );

    const ordersRow = screen.getByRole("row", { name: /Orders/ });
    const ordersCheckbox = within(ordersRow).getByRole("checkbox");
    expect(ordersCheckbox).toBeChecked();
    expect(ordersCheckbox).toBeDisabled();
    expect(ordersRow).toHaveAttribute("data-disabled");
    const childCheckbox = within(
      screen.getByRole("row", { name: /Child folder/ }),
    ).getByRole("checkbox");
    expect(childCheckbox).toBeChecked();
    expect(childCheckbox).toBeDisabled();
    // The count reflects only the top-level items selected
    expect(screen.getByText("1 item selected")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("row", { name: /Sales folder/ })).getByRole(
        "button",
        { name: "Collapse" },
      ),
    );
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.getByText("1 item selected")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("toast-card")).getByRole("button", {
        name: "Move",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Destination" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(`path:/api/collection/${FOLDER.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1),
    );
    const [moveCall] = fetchMock.callHistory.calls(
      `path:/api/collection/${FOLDER.id}`,
      { method: "PUT" },
    );
    expect(JSON.parse(String(moveCall.options.body))).toMatchObject({
      parent_id: DESTINATION_FOLDER.id,
    });
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${ORDERS.id}`, {
        method: "PUT",
      }),
    ).toHaveLength(0);
    expect(
      fetchMock.callHistory.calls(`path:/api/collection/${childFolder.id}`, {
        method: "PUT",
      }),
    ).toHaveLength(0);
  });
});

const SECTION_LIBRARY_ID = 101;
const SECTION_DATA_COLLECTION = createMockCollection({
  id: 102,
  name: "Data",
  type: "library-data",
  location: `/${SECTION_LIBRARY_ID}/`,
  can_write: true,
  is_library_root: true,
});
const SECTION_METRICS_COLLECTION = createMockCollection({
  id: 103,
  name: "Metrics",
  type: "library-metrics",
  location: `/${SECTION_LIBRARY_ID}/`,
  can_write: true,
  is_library_root: true,
});
const SECTION_LIBRARY = createMockCollection({
  id: SECTION_LIBRARY_ID,
  name: "Library",
  type: "library",
  children: [SECTION_DATA_COLLECTION, SECTION_METRICS_COLLECTION],
});

const DATA_EMPTY_TEXT =
  "Cleaned, pre-transformed data sources ready for exploring";
const METRICS_EMPTY_TEXT = "Standardized calculations with known dimensions";

const createSectionTable = (id: number, name: string) =>
  createMockCollectionItem({
    id,
    name,
    model: "table",
    database_id: 1,
    collection_id: SECTION_DATA_COLLECTION.id,
    can_write: true,
  });

type SectionsSetupOpts = {
  dataItems?: CollectionItem[];
  metricItems?: CollectionItem[];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

function setupSections({
  dataItems = [],
  metricItems = [],
  remoteSyncType,
}: SectionsSetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 1000 });
  setupCollectionsEndpoints({ collections: [SECTION_LIBRARY] });
  setupItems(SECTION_DATA_COLLECTION, dataItems);
  setupItems(SECTION_METRICS_COLLECTION, metricItems);
  setupSearchEndpoints([]);
  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": remoteSyncType != null,
      "token-features": createMockTokenFeatures({
        library: true,
        remote_sync: true,
      }),
    }),
    currentUser: createMockUser({ is_superuser: true }),
  });
  setupEnterprisePlugins();

  return renderWithProviders(<Route path="/" element={<LibraryPage />} />, {
    withRouter: true,
    storeInitialState: state,
  });
}

async function findEmptyStateRow(text: string) {
  return waitFor(() => {
    const row = screen
      .getAllByTestId("empty-state-row")
      .find((row) => within(row).queryByText(text) != null);
    if (row == null) {
      throw new Error(`No empty state row with "${text}"`);
    }
    return row;
  });
}

function getRow(name: string) {
  const row = screen
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name) != null);
  if (row == null) {
    throw new Error(`No row with "${name}"`);
  }
  return row;
}

function getRowCheckbox(name: string) {
  return within(getRow(name)).getByRole("checkbox");
}

describe("LibraryPage sections", () => {
  it("shows the empty state of each section with its action", async () => {
    setupSections();

    const dataEmptyState = await findEmptyStateRow(DATA_EMPTY_TEXT);
    expect(
      within(dataEmptyState).getByRole("button", { name: "Publish a table" }),
    ).toBeInTheDocument();
    const metricsEmptyState = await findEmptyStateRow(METRICS_EMPTY_TEXT);
    expect(
      within(metricsEmptyState).getByRole("link", { name: "New metric" }),
    ).toHaveAttribute(
      "href",
      Urls.newDataStudioMetric({ collectionId: SECTION_METRICS_COLLECTION.id }),
    );
    expect(screen.getByRole("button", { name: /New/ })).toBeInTheDocument();

    // The semantic layer has no snippets or actions sections
    expect(
      screen
        .getAllByTestId("collection-name")
        .map((element) => element.textContent),
    ).toEqual(["Data", "Metrics"]);
  });

  it("opens the table picker from the Data empty state, with published tables disabled", async () => {
    setupDatabasesEndpoints([
      createMockDatabase({
        id: 1,
        name: "Sample Database",
        tables: [
          createMockTable({
            id: 10,
            db_id: 1,
            schema: "PUBLIC",
            display_name: "Orders",
            is_published: true,
          }),
          createMockTable({
            id: 11,
            db_id: 1,
            schema: "PUBLIC",
            display_name: "People",
            is_published: false,
          }),
        ],
      }),
    ]);
    setupLibraryEndpoints({ hasLibrary: true });
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    // the picker reads the personal collection of the current user
    const personalCollection = createMockCollection({
      id: 1,
      is_personal: true,
    });
    setupCollectionByIdEndpoint({ collections: [personalCollection] });
    setupItems(personalCollection, []);
    setupSections();

    await userEvent.click(
      within(await findEmptyStateRow(DATA_EMPTY_TEXT)).getByRole("button", {
        name: "Publish a table",
      }),
    );

    const picker = await screen.findByRole("dialog", {
      name: "Select a table to publish",
    });
    await userEvent.click(await within(picker).findByText("Sample Database"));
    const getPickerItem = (name: string) =>
      within(picker).getByRole("link", { name: new RegExp(name) });
    await waitFor(() =>
      expect(getPickerItem("Orders")).toHaveAttribute("data-disabled"),
    );
    expect(getPickerItem("People")).not.toHaveAttribute("data-disabled");
  });

  it("hides the empty states while searching and shows them again when the search is cleared", async () => {
    setupSections();

    await findEmptyStateRow(DATA_EMPTY_TEXT);
    const searchInput = screen.getByPlaceholderText("Search...");
    await userEvent.type(searchInput, "Publish");

    await waitFor(() => {
      const call = fetchMock.callHistory.lastCall("path:/api/search");
      expect(call).toBeDefined();
      const params = new URL(String(call?.url)).searchParams;
      expect(params.get("q")).toBe("Publish");
      expect(params.get("collection")).toBe(String(SECTION_LIBRARY_ID));
    });
    expect(
      await screen.findByText('No results for "Publish"'),
    ).toBeInTheDocument();
    expect(screen.queryByText(DATA_EMPTY_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(METRICS_EMPTY_TEXT)).not.toBeInTheDocument();

    await userEvent.clear(searchInput);
    expect(await findEmptyStateRow(DATA_EMPTY_TEXT)).toBeInTheDocument();
  });

  it("keeps the Metrics empty state expanded when the Data section has tables", async () => {
    setupSections({ dataItems: [createSectionTable(10, "Orders")] });

    expect(await screen.findByTestId("table-name")).toHaveTextContent("Orders");
    expect(await findEmptyStateRow(METRICS_EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(DATA_EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it("hides the New button and the empty state actions in read-only mode", async () => {
    setupSections({ remoteSyncType: "read-only" });

    const dataEmptyState = await findEmptyStateRow(DATA_EMPTY_TEXT);
    const metricsEmptyState = await findEmptyStateRow(METRICS_EMPTY_TEXT);
    expect(
      within(dataEmptyState).queryByRole("button", { name: "Publish a table" }),
    ).not.toBeInTheDocument();
    expect(
      within(metricsEmptyState).queryByRole("link", { name: "New metric" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { remoteSyncType: undefined, hasCheckboxes: true },
    { remoteSyncType: "read-only" as const, hasCheckboxes: false },
  ])(
    "shows row checkboxes only on writable instances (remote sync $remoteSyncType)",
    async ({ remoteSyncType, hasCheckboxes }) => {
      setupSections({
        dataItems: [createSectionTable(10, "Orders")],
        remoteSyncType,
      });

      const ordersRow = await screen.findByRole("row", { name: /Orders/ });
      expect(within(ordersRow).queryAllByRole("checkbox")).toHaveLength(
        hasCheckboxes ? 1 : 0,
      );
      expect(screen.queryAllByRole("checkbox").length > 0).toBe(hasCheckboxes);
    },
  );

  it("selects the items of a section from its root row and keeps the selection in one section", async () => {
    setupSections({
      dataItems: [
        createSectionTable(10, "Orders"),
        createSectionTable(12, "Reviews"),
        createMockCollectionItem({
          id: 20,
          name: "Folder A",
          model: "collection",
          type: "library-data",
          location: `/${SECTION_LIBRARY_ID}/${SECTION_DATA_COLLECTION.id}/`,
          can_write: true,
        }),
      ],
      metricItems: [
        createMockCollectionItem({
          id: 30,
          name: "Trusted Orders Metric",
          model: "metric",
          collection_id: SECTION_METRICS_COLLECTION.id,
          can_write: true,
        }),
      ],
    });

    await screen.findByText("Orders");
    await userEvent.click(getRowCheckbox("Data"));
    expect(getRowCheckbox("Orders")).toBeChecked();
    expect(getRowCheckbox("Reviews")).toBeChecked();
    expect(getRowCheckbox("Folder A")).toBeChecked();
    expect(getRowCheckbox("Trusted Orders Metric")).not.toBeChecked();
    expect(await screen.findByText("3 items selected")).toBeInTheDocument();
    const bulkBar = screen.getByTestId("toast-card");
    await userEvent.click(
      within(bulkBar).getByRole("button", { name: "Clear" }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("toast-card")).not.toBeInTheDocument(),
    );

    await userEvent.click(getRowCheckbox("Orders"));
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    // A table is selected, so it can be unpublished but not moved to trash
    expect(
      screen.getByRole("button", { name: "Unpublish" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move to trash" }),
    ).not.toBeInTheDocument();

    await userEvent.click(getRowCheckbox("Trusted Orders Metric"));
    expect(screen.getByText("1 item selected")).toBeInTheDocument();
    expect(getRowCheckbox("Orders")).not.toBeChecked();
    expect(getRowCheckbox("Trusted Orders Metric")).toBeChecked();
    await userEvent.click(
      within(screen.getByTestId("toast-card")).getByRole("button", {
        name: "Clear",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("toast-card")).not.toBeInTheDocument(),
    );
  });
});

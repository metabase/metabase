import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
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
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
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
  isFolderReadable?: boolean;
};

function setup({
  destinationItems = [],
  isFolderReadable = true,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 1000 });
  setupCollectionsEndpoints({ collections: [LIBRARY_COLLECTION] });
  setupItems(DATA_COLLECTION, [
    FOLDER,
    {
      ...DESTINATION_FOLDER,
      here: destinationItems.length > 0 ? ["table"] : [],
    },
  ]);
  if (isFolderReadable) {
    setupFolderItems([ORDERS]);
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
});

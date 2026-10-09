import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { collectionApi } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { Route } from "metabase/router";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { LibraryPage } from "./LibraryPage";

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

const createTableItem = (id: number, name: string) =>
  createMockCollectionItem({
    id,
    name,
    model: "table",
    database_id: 1,
    collection_id: FOLDER.id,
  });

function setupFolderItems(collectionItems: CollectionItem[]) {
  setupCollectionItemsEndpoint({ collection: FOLDER, collectionItems });
}

function setup() {
  mockGetBoundingClientRect({ width: 1000, height: 1000 });
  setupCollectionsEndpoints({ collections: [LIBRARY_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: DATA_COLLECTION,
    collectionItems: [FOLDER],
  });
  setupFolderItems([createTableItem(10, "Orders")]);
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

describe("LibraryPage", () => {
  it("updates an expanded folder when its items change", async () => {
    const { store } = setup();

    await userEvent.click(await screen.findByText("Sales folder"));
    expect(await screen.findByText("Orders")).toBeInTheDocument();

    fetchMock.removeRoute("collection-5-items");
    fetchMock.removeRoute("collection-5-items-metadata");
    setupFolderItems([createTableItem(11, "Invoices")]);
    act(() => {
      store.dispatch(collectionApi.util.invalidateTags([listTag("table")]));
    });

    expect(await screen.findByText("Invoices")).toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
  });
});

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const collection = createMockCollection({ id: 1, can_write: true });

const pinnedDashboard = createMockCollectionItem({
  id: 1,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 1,
});

const regularQuestion = createMockCollectionItem({
  id: 2,
  name: "Regular question",
  model: "card",
});

function setup() {
  setupDatabasesEndpoints([createMockDatabase()]);
  setupBookmarksEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionItemsEndpoint({
    collection,
    collectionItems: [pinnedDashboard, regularQuestion],
  });

  renderWithProviders(
    <Route path="/" element={<CollectionContent collectionId={1} />} />,
    { withRouter: true, withDND: true },
  );
}

describe("CollectionContent pinned items", () => {
  it("shows pinned items in both the pinned section and the contents list", async () => {
    setup();

    const pinnedSection = within(await screen.findByTestId("pinned-items"));
    expect(
      await pinnedSection.findByText("Pinned dashboard"),
    ).toBeInTheDocument();

    const table = within(await screen.findByTestId("collection-table"));
    expect(await table.findByText("Pinned dashboard")).toBeInTheDocument();
    expect(table.getByText("Regular question")).toBeInTheDocument();
  });
});

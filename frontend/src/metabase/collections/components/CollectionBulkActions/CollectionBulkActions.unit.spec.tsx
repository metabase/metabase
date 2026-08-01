import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

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
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionBulkActions } from "./CollectionBulkActions";

const SOURCE_COLLECTION_ID = 11;
const DESTINATION_COLLECTION_ID = 12;

const SOURCE_COLLECTION = createMockCollection({
  id: SOURCE_COLLECTION_ID,
  name: "First Collection",
  location: "/",
  can_write: true,
});

const DESTINATION_COLLECTION = createMockCollection({
  id: DESTINATION_COLLECTION_ID,
  name: "Second Collection",
  location: "/",
  can_write: true,
});

const MOVED_CARD = createMockCard({ id: 1, name: "Revenue" });

const MOVED_ITEM = createMockCollectionItem({
  id: MOVED_CARD.id,
  model: "card",
  name: MOVED_CARD.name,
  collection: SOURCE_COLLECTION,
  collection_id: SOURCE_COLLECTION.id,
});

const MOVE_ERROR = "Cannot move content into or out of a remote sync worktree.";

function TestComponent({ selected }: { selected: CollectionItem[] }) {
  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(
    selected,
  );
  const [selectedAction, setSelectedAction] = useState<string | null>("move");

  return (
    <>
      <CollectionBulkActions
        collection={SOURCE_COLLECTION}
        selected={selected}
        clearSelected={jest.fn()}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        selectedAction={selectedAction}
        setSelectedAction={setSelectedAction}
      />
      <UndoListing />
    </>
  );
}

function setup({
  moveResponse,
}: {
  moveResponse: Parameters<typeof fetchMock.put>[1];
}) {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [SOURCE_COLLECTION, DESTINATION_COLLECTION],
    rootCollection: createMockCollection(ROOT_COLLECTION),
  });
  setupCollectionByIdEndpoint({
    collections: [SOURCE_COLLECTION, DESTINATION_COLLECTION],
  });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      createMockCollectionItem({
        id: SOURCE_COLLECTION_ID,
        model: "collection",
        name: SOURCE_COLLECTION.name,
        can_write: true,
      }),
      createMockCollectionItem({
        id: DESTINATION_COLLECTION_ID,
        model: "collection",
        name: DESTINATION_COLLECTION.name,
        can_write: true,
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: SOURCE_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: DESTINATION_COLLECTION,
    collectionItems: [],
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });
  fetchMock.get(`path:/api/card/${MOVED_CARD.id}`, MOVED_CARD);
  fetchMock.put(`path:/api/card/${MOVED_CARD.id}`, moveResponse);

  renderWithProviders(<TestComponent selected={[MOVED_ITEM]} />);
}

async function moveToDestination() {
  await waitForLoaderToBeRemoved();
  await userEvent.click(await screen.findByText(DESTINATION_COLLECTION.name));
  await userEvent.click(screen.getByTestId("entity-picker-select-button"));
}

describe("CollectionBulkActions", () => {
  it("keeps the picker open and shows the server's message when a move is rejected", async () => {
    setup({ moveResponse: { status: 400, body: { message: MOVE_ERROR } } });

    await moveToDestination();

    const modal = await screen.findByTestId("entity-picker-modal");
    expect(await within(modal).findByText(MOVE_ERROR)).toBeInTheDocument();
  });

  it("closes the picker when the move succeeds", async () => {
    setup({ moveResponse: MOVED_CARD });

    await moveToDestination();

    expect(await screen.findByText(/moved/i)).toBeInTheDocument();
    expect(screen.queryByTestId("entity-picker-modal")).not.toBeInTheDocument();
  });
});

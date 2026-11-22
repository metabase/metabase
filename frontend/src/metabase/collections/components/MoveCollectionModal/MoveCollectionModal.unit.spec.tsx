import userEvent from "@testing-library/user-event";
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
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockRecentCollectionItem,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";

import { MoveCollectionModal } from "./MoveCollectionModal";

const firstCollection = createMockCollection({
  id: 11,
  name: "First collection",
  location: "/",
  can_write: true,
});
const secondCollection = createMockCollection({
  id: 12,
  name: "Second collection",
  location: "/11/",
  parent_id: 11,
  can_write: true,
});
const thirdCollection = createMockCollection({
  id: 13,
  name: "Third collection",
  location: "/11/12/",
  parent_id: 12,
  can_write: true,
});
const personalCollection = createMockCollection({
  id: 99,
  name: "Bobby Tables's Personal Collection",
  location: "/",
  personal_owner_id: 1,
  is_personal: true,
  can_write: true,
});

function toCollectionItem(collection: typeof firstCollection) {
  return createMockCollectionItem({
    id: Number(collection.id),
    name: collection.name,
    model: "collection",
    location: collection.location ?? undefined,
    here: ["collection"],
    below: ["collection"],
    can_write: true,
  });
}

function toSearchResult(
  collection: typeof firstCollection,
  parentName: string,
): SearchResult {
  return createMockSearchResult({
    id: Number(collection.id),
    name: collection.name,
    model: "collection",
    can_write: true,
    collection: createMockCollection({ id: 1, name: parentName }),
  });
}

const SEARCH_TEXT = "coll";
// Tells search results apart from the recents they replace
const SEARCH_RESULT_LOCATION = "Search result location";

function setup() {
  mockGetBoundingClientRect();
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [
      firstCollection,
      secondCollection,
      thirdCollection,
      personalCollection,
    ],
  });
  setupCollectionByIdEndpoint({
    collections: [
      firstCollection,
      secondCollection,
      thirdCollection,
      personalCollection,
    ],
  });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [toCollectionItem(firstCollection)],
  });
  setupCollectionItemsEndpoint({
    collection: firstCollection,
    collectionItems: [toCollectionItem(secondCollection)],
  });
  setupCollectionItemsEndpoint({
    collection: secondCollection,
    collectionItems: [toCollectionItem(thirdCollection)],
  });
  setupCollectionItemsEndpoint({
    collection: thirdCollection,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: personalCollection,
    collectionItems: [],
  });
  setupRecentViewsAndSelectionsEndpoints(
    [
      { collection: firstCollection, parentName: "Our analytics" },
      { collection: secondCollection, parentName: firstCollection.name },
      { collection: thirdCollection, parentName: secondCollection.name },
    ].map(({ collection, parentName }) =>
      createMockRecentCollectionItem({
        id: Number(collection.id),
        name: collection.name,
        model: "collection",
        can_write: true,
        parent_collection: {
          id: collection.parent_id ?? null,
          name: parentName,
        },
      }),
    ),
    ["selections", "views"],
  );
  fetchMock.get("path:/api/search", (call) => {
    const query = new URL(call.url).searchParams.get("q");
    const data =
      query === SEARCH_TEXT
        ? [
            toSearchResult(personalCollection, SEARCH_RESULT_LOCATION),
            toSearchResult(secondCollection, SEARCH_RESULT_LOCATION),
            toSearchResult(thirdCollection, SEARCH_RESULT_LOCATION),
          ]
        : [];
    return { data, total: data.length };
  });
  fetchMock.get("path:/api/user/recipients", { data: [] });

  const onClose = jest.fn();
  renderWithProviders(
    <MoveCollectionModal collectionId={thirdCollection.id} onClose={onClose} />,
    {
      storeInitialState: {
        currentUser: createMockUser({ id: 1, personal_collection_id: 99 }),
      },
    },
  );
  return { onClose };
}

/** Picker items are named by their icon, then their own name, then their location */
function pickerItemName(name: string) {
  return new RegExp(`^[\\w-]+ icon ${name}`);
}

function getPickerItem(name: string) {
  return screen.getByRole("link", { name: pickerItemName(name) });
}

function findPickerItem(name: string) {
  return screen.findByRole("link", { name: pickerItemName(name) });
}

/** Recents and search results, which load in place of the collection tree */
async function findResultTexts() {
  const results = await screen.findAllByTestId("result-item");
  return results.map((result) => result.textContent);
}

describe("MoveCollectionModal", () => {
  it("starts at the current parent and disables the moving collection", async () => {
    setup();

    expect(await findPickerItem("Third collection")).toHaveAttribute(
      "data-disabled",
    );
    expect(getPickerItem("Second collection")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(getPickerItem("First collection")).not.toHaveAttribute(
      "data-disabled",
    );
  });

  it("does not offer the current parent or the moving collection in recents or search results", async () => {
    setup();

    expect(await findPickerItem("Third collection")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Recent items"));

    expect(await findResultTexts()).toEqual([
      `${firstCollection.name} Our analytics`,
    ]);

    await userEvent.type(
      within(screen.getByTestId("entity-picker-modal")).getByPlaceholderText(
        "Search…",
      ),
      SEARCH_TEXT,
    );

    expect(await screen.findAllByText(SEARCH_RESULT_LOCATION)).not.toHaveLength(
      0,
    );
    expect(await findResultTexts()).toEqual([
      `${personalCollection.name} ${SEARCH_RESULT_LOCATION}`,
    ]);
  });

  it("shows the error message when the move fails (metabase#40700)", async () => {
    fetchMock.put(`path:/api/collection/${thirdCollection.id}`, {
      status: 500,
      body: { message: "Ryan said no" },
    });
    const { onClose } = setup();

    await userEvent.click(await findPickerItem("Our analytics"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));

    expect(await screen.findByText("Ryan said no")).toBeInTheDocument();
    const calls = fetchMock.callHistory.calls(
      `path:/api/collection/${thirdCollection.id}`,
      { method: "PUT" },
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toMatchObject({
      parent_id: null,
    });
    await waitFor(() => {
      expect(screen.getByTestId("entity-picker-modal")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

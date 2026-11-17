import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupCreateBookmarkEndpoint,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupDeleteBookmarkEndpoint,
  setupNullGetUserKeyValueEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
import type {
  Bookmark,
  BookmarkType,
  CollectionItem,
} from "metabase-types/api";
import {
  createMockBookmark,
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const COLLECTION_ID = 1;

const COLLECTION = createMockCollection({
  id: COLLECTION_ID,
  name: "First collection",
  can_write: true,
});

const PINNED_QUESTION = createMockCollectionItem({
  id: 1,
  name: "Pinned question",
  model: "card",
  collection_position: 1,
});

const PINNED_DASHBOARD = createMockCollectionItem({
  id: 2,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 2,
});

const QUESTION = createMockCollectionItem({
  id: 3,
  name: "Orders",
  model: "card",
});

const DASHBOARD = createMockCollectionItem({
  id: 4,
  name: "Revenue dashboard",
  model: "dashboard",
});

const MODEL = createMockCollectionItem({
  id: 5,
  name: "Customers model",
  model: "dataset",
  type: "model",
});

const CHILD_COLLECTION = createMockCollectionItem({
  id: 6,
  name: "Child collection",
  model: "collection",
});

const COLLECTION_ITEMS = [
  PINNED_QUESTION,
  PINNED_DASHBOARD,
  QUESTION,
  DASHBOARD,
  MODEL,
  CHILD_COLLECTION,
];

const BOOKMARK_TYPES: Record<string, BookmarkType> = {
  card: "card",
  dataset: "card",
  dashboard: "dashboard",
  collection: "collection",
};

const getBookmarkType = (item: CollectionItem) => BOOKMARK_TYPES[item.model];

const getItemBookmark = (item: CollectionItem) =>
  createMockBookmark({
    id: `${getBookmarkType(item)}-${item.id}`,
    type: getBookmarkType(item),
    item_id: item.id,
    name: item.name,
  });

interface SetupOpts {
  bookmarks?: Bookmark[];
}

async function setup({ bookmarks = [] }: SetupOpts = {}) {
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");

  setupCollectionByIdEndpoint({ collections: [COLLECTION] });
  setupCollectionsEndpoints({ collections: [COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: COLLECTION,
    collectionItems: COLLECTION_ITEMS,
  });
  setupBookmarksEndpoints(bookmarks);
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(
    <Route
      path="/"
      element={<CollectionContent collectionId={COLLECTION.id} />}
    />,
    { withRouter: true, withDND: true },
  );

  await screen.findByTestId("pinned-items");
  await screen.findByText(QUESTION.name);

  return { trackSimpleEvent };
}

const bookmarkCalls = (
  type: BookmarkType,
  id: number,
  method: "POST" | "DELETE",
) =>
  fetchMock.callHistory.calls(`path:/api/bookmark/${type}/${id}`, { method });

const getBookmarkAddedEvents = (
  trackSimpleEvent: jest.SpiedFunction<typeof Analytics.trackSimpleEvent>,
) =>
  trackSimpleEvent.mock.calls
    .map(([event]) => event)
    .filter(({ event }) => event === "bookmark_added");

async function openRowMenu(item: CollectionItem) {
  const row = within(screen.getByTestId("collection-table")).getByRole("row", {
    name: new RegExp(item.name),
  });
  await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
}

async function openPinnedItemMenu(item: CollectionItem) {
  const card = within(screen.getByTestId("pinned-items")).getByRole("link", {
    name: new RegExp(item.name),
  });
  await userEvent.click(within(card).getByRole("button", { name: "Actions" }));
}

describe("CollectionContent bookmarks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("collection header", () => {
    it("bookmarks the collection and tracks it", async () => {
      setupCreateBookmarkEndpoint({
        type: "collection",
        item_id: COLLECTION_ID,
      });
      const { trackSimpleEvent } = await setup();

      await userEvent.click(screen.getByRole("button", { name: "Bookmark" }));

      await waitFor(() =>
        expect(bookmarkCalls("collection", COLLECTION_ID, "POST")).toHaveLength(
          1,
        ),
      );
      expect(getBookmarkAddedEvents(trackSimpleEvent)).toEqual([
        {
          event: "bookmark_added",
          event_detail: "collection",
          triggered_from: "collection_header",
        },
      ]);
    });

    it("removes the collection bookmark without tracking it", async () => {
      setupDeleteBookmarkEndpoint({
        type: "collection",
        item_id: COLLECTION_ID,
      });
      const { trackSimpleEvent } = await setup({
        bookmarks: [
          createMockBookmark({
            id: `collection-${COLLECTION_ID}`,
            type: "collection",
            item_id: COLLECTION_ID,
            name: COLLECTION.name,
          }),
        ],
      });

      await userEvent.click(
        await screen.findByRole("button", { name: "Remove from bookmarks" }),
      );

      await waitFor(() =>
        expect(
          bookmarkCalls("collection", COLLECTION_ID, "DELETE"),
        ).toHaveLength(1),
      );
      expect(getBookmarkAddedEvents(trackSimpleEvent)).toEqual([]);
    });
  });

  describe("collection items", () => {
    it.each([
      { item: QUESTION, eventDetail: "question" },
      { item: DASHBOARD, eventDetail: "dashboard" },
      { item: MODEL, eventDetail: "model" },
      { item: CHILD_COLLECTION, eventDetail: "collection" },
    ])(
      "bookmarks an unpinned $eventDetail from its menu and tracks it",
      async ({ item, eventDetail }) => {
        const type = getBookmarkType(item);
        setupCreateBookmarkEndpoint({ type, item_id: item.id });
        const { trackSimpleEvent } = await setup();

        await openRowMenu(item);
        await userEvent.click(
          await screen.findByRole("menuitem", { name: /^Bookmark/ }),
        );

        await waitFor(() =>
          expect(bookmarkCalls(type, item.id, "POST")).toHaveLength(1),
        );
        expect(getBookmarkAddedEvents(trackSimpleEvent)).toEqual([
          {
            event: "bookmark_added",
            event_detail: eventDetail,
            triggered_from: "collection_list",
          },
        ]);
      },
    );

    it.each([
      { item: QUESTION, eventDetail: "question" },
      { item: DASHBOARD, eventDetail: "dashboard" },
      { item: MODEL, eventDetail: "model" },
      { item: CHILD_COLLECTION, eventDetail: "collection" },
    ])(
      "removes the bookmark of an unpinned $eventDetail from its menu without tracking it",
      async ({ item }) => {
        const type = getBookmarkType(item);
        setupDeleteBookmarkEndpoint({ type, item_id: item.id });
        const { trackSimpleEvent } = await setup({
          bookmarks: [getItemBookmark(item)],
        });

        await openRowMenu(item);
        await userEvent.click(
          await screen.findByRole("menuitem", {
            name: /Remove from bookmarks/,
          }),
        );

        await waitFor(() =>
          expect(bookmarkCalls(type, item.id, "DELETE")).toHaveLength(1),
        );
        expect(bookmarkCalls(type, item.id, "POST")).toHaveLength(0);
        expect(getBookmarkAddedEvents(trackSimpleEvent)).toEqual([]);
      },
    );

    it.each([
      { item: PINNED_QUESTION, eventDetail: "question" },
      { item: PINNED_DASHBOARD, eventDetail: "dashboard" },
    ])(
      "bookmarks a pinned $eventDetail from its card menu and tracks it",
      async ({ item, eventDetail }) => {
        const type = getBookmarkType(item);
        setupCreateBookmarkEndpoint({ type, item_id: item.id });
        const { trackSimpleEvent } = await setup();

        await openPinnedItemMenu(item);
        await userEvent.click(
          await screen.findByRole("menuitem", { name: /^Bookmark/ }),
        );

        await waitFor(() =>
          expect(bookmarkCalls(type, item.id, "POST")).toHaveLength(1),
        );
        expect(getBookmarkAddedEvents(trackSimpleEvent)).toEqual([
          {
            event: "bookmark_added",
            event_detail: eventDetail,
            triggered_from: "collection_list",
          },
        ]);
      },
    );
  });
});

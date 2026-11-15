import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  setupCardEndpoints,
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
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import {
  createMockBookmark,
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDocument,
} from "metabase-types/api/mocks";

import { CollectionBulkActions } from "./CollectionBulkActions";

const writableCollection = createMockCollection({
  id: 1,
  name: "Writable collection",
  can_write: true,
});

const destinationCollectionId = 10;
const destinationCollection = createMockCollection({
  id: destinationCollectionId,
  name: "Destination collection",
  can_write: true,
  location: "/",
});

const pinnedDashboard = createMockCollectionItem({
  id: 1,
  name: "Pinned dashboard",
  model: "dashboard",
  collection_position: 1,
});

const pinnedQuestion = createMockCollectionItem({
  id: 2,
  name: "Pinned question",
  model: "card",
  collection_position: 2,
});

const tableQuestion = createMockCollectionItem({
  id: 3,
  name: "Table question",
  model: "card",
  collection_position: null,
});

const tableDashboard = createMockCollectionItem({
  id: 4,
  name: "Table dashboard",
  model: "dashboard",
  collection_position: null,
});

const childCollection = createMockCollectionItem({
  id: 5,
  name: "Child collection",
  model: "collection",
  collection_position: null,
});

const tableModel = createMockCollectionItem({
  id: 7,
  name: "Table model",
  model: "dataset",
  collection_position: null,
});

const physicalTable = createMockCollectionItem({
  id: 8,
  name: "Physical table",
  model: "table",
  collection_position: null,
});

const tableDocument = createMockCollectionItem({
  id: 9,
  name: "Table document",
  model: "document",
  collection_position: null,
});

function TestComponent({
  selected,
  collection,
  bookmarks,
  clearSelected,
}: {
  selected: CollectionItem[];
  collection: Collection;
  bookmarks: Bookmark[];
  clearSelected: () => void;
}) {
  const [selectedItems, setSelectedItems] = useState<CollectionItem[] | null>(
    null,
  );
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  return (
    <CollectionBulkActions
      selected={selected}
      collection={collection}
      bookmarks={bookmarks}
      selectedItems={selectedItems}
      setSelectedItems={setSelectedItems}
      selectedAction={selectedAction}
      setSelectedAction={setSelectedAction}
      clearSelected={clearSelected}
    />
  );
}

function setup({
  selected,
  collection = writableCollection,
  bookmarks = [],
}: {
  selected: CollectionItem[];
  collection?: Collection;
  bookmarks?: Bookmark[];
}) {
  const clearSelected = jest.fn();

  renderWithProviders(
    <TestComponent
      selected={selected}
      collection={collection}
      bookmarks={bookmarks}
      clearSelected={clearSelected}
    />,
    { withUndos: true },
  );

  return { clearSelected };
}

async function openOverflowMenu() {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  return await screen.findByRole("menu");
}

function getRequests(matcher: string) {
  return fetchMock.callHistory.calls(matcher);
}

function getLastRequestBody(matcher: string) {
  const call = fetchMock.callHistory.lastCall(matcher);
  // request bodies sent by the component are always JSON strings
  return JSON.parse(call?.options.body as string);
}

function getMenuItem(name: string) {
  return screen.getByRole("menuitem", { name });
}

function getTrackedEvents(
  trackSimpleEvent: jest.SpiedFunction<typeof Analytics.trackSimpleEvent>,
  eventName: string,
) {
  return trackSimpleEvent.mock.calls
    .map(([event]) => event)
    .filter(({ event }) => event === eventName);
}

function setupMovePickerEndpoints() {
  mockGetBoundingClientRect();
  const rootCollection = createMockCollection(ROOT_COLLECTION);
  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [writableCollection, destinationCollection],
    rootCollection,
  });
  setupCollectionByIdEndpoint({
    collections: [writableCollection, destinationCollection],
  });
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      createMockCollectionItem({
        id: destinationCollectionId,
        model: "collection",
        name: destinationCollection.name,
        collection_id: null,
        can_write: true,
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: writableCollection,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: destinationCollection,
    collectionItems: [],
  });
  fetchMock.get("path:/api/search", { data: [] });
  fetchMock.get("path:/api/user/recipients", { data: [] });
}

describe("CollectionBulkActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("selection composition", () => {
    it("keeps Move primary and offers Pin all for an unpinned-only selection", async () => {
      setup({ selected: [tableQuestion, tableDashboard] });

      expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Move to trash" }),
      ).not.toBeInTheDocument();

      const menu = await openOverflowMenu();
      const itemLabels = within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
      expect(itemLabels).toEqual([
        "Pin all",
        "Bookmark",
        "Duplicate",
        "Deselect all",
        "Move to trash",
      ]);
    });

    it("makes Unpin all the primary action for a pinned-only selection", async () => {
      setup({ selected: [pinnedDashboard, pinnedQuestion] });

      expect(
        screen.getByRole("button", { name: "Unpin all" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Move" }),
      ).not.toBeInTheDocument();

      const menu = await openOverflowMenu();
      const itemLabels = within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
      expect(itemLabels).toEqual([
        "Move",
        "Bookmark",
        "Duplicate",
        "Deselect all",
        "Move to trash",
      ]);
    });

    it("keeps Move primary and offers both pin actions for a mixed selection", async () => {
      setup({ selected: [pinnedDashboard, tableQuestion] });

      expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Unpin all" }),
      ).not.toBeInTheDocument();

      const menu = await openOverflowMenu();
      const itemLabels = within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
      expect(itemLabels).toEqual([
        "Pin all",
        "Unpin all",
        "Bookmark",
        "Duplicate",
        "Deselect all",
        "Move to trash",
      ]);
    });
  });

  describe("pinning", () => {
    it("pins only the unpinned items with Pin all", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      fetchMock.put("path:/api/card/3", {});
      fetchMock.put("path:/api/dashboard/4", {});
      const { clearSelected } = setup({
        selected: [pinnedDashboard, tableQuestion, tableDashboard],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Pin all"));

      await waitFor(() => {
        expect(getRequests("path:/api/card/3")).toHaveLength(1);
      });
      expect(getRequests("path:/api/dashboard/4")).toHaveLength(1);
      expect(getRequests("path:/api/dashboard/1")).toHaveLength(0);

      expect(getLastRequestBody("path:/api/card/3")).toEqual({
        collection_position: 1,
      });

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
      const pinEvents = getTrackedEvents(
        trackSimpleEvent,
        "collection_item_pinned",
      );
      expect(pinEvents).toHaveLength(2);
      expect(pinEvents).toEqual(
        expect.arrayContaining([
          {
            event: "collection_item_pinned",
            event_detail: "question",
            target_id: tableQuestion.id,
            triggered_from: "bulk_action_bar",
            result: "success",
          },
          {
            event: "collection_item_pinned",
            event_detail: "dashboard",
            target_id: tableDashboard.id,
            triggered_from: "bulk_action_bar",
            result: "success",
          },
        ]),
      );
    });

    it("unpins only the pinned items with Unpin all", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      fetchMock.put("path:/api/dashboard/1", {});
      fetchMock.put("path:/api/card/2", {});
      const { clearSelected } = setup({
        selected: [pinnedDashboard, pinnedQuestion, tableQuestion],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Unpin all"));

      await waitFor(() => {
        expect(getRequests("path:/api/dashboard/1")).toHaveLength(1);
      });
      expect(getRequests("path:/api/card/2")).toHaveLength(1);
      expect(getRequests("path:/api/card/3")).toHaveLength(0);

      expect(getLastRequestBody("path:/api/dashboard/1")).toEqual({
        collection_position: null,
      });

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
      const unpinEvents = getTrackedEvents(
        trackSimpleEvent,
        "collection_item_unpinned",
      );
      expect(unpinEvents).toHaveLength(2);
      expect(unpinEvents).toEqual(
        expect.arrayContaining([
          {
            event: "collection_item_unpinned",
            event_detail: "dashboard",
            target_id: pinnedDashboard.id,
            triggered_from: "bulk_action_bar",
            result: "success",
          },
          {
            event: "collection_item_unpinned",
            event_detail: "question",
            target_id: pinnedQuestion.id,
            triggered_from: "bulk_action_bar",
            result: "success",
          },
        ]),
      );
    });

    it("tracks each result when a bulk pin partially fails", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      fetchMock.put("path:/api/card/3", {});
      fetchMock.put("path:/api/dashboard/4", {
        status: 500,
        body: { message: "Something went wrong" },
      });
      const { clearSelected } = setup({
        selected: [tableQuestion, tableDashboard],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Pin all"));

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
      const pinEvents = getTrackedEvents(
        trackSimpleEvent,
        "collection_item_pinned",
      );
      expect(pinEvents).toHaveLength(2);
      expect(pinEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target_id: tableQuestion.id,
            result: "success",
          }),
          expect.objectContaining({
            target_id: tableDashboard.id,
            result: "failure",
          }),
        ]),
      );
    });

    it("unpins a pinned-only selection with the primary Unpin all button", async () => {
      fetchMock.put("path:/api/dashboard/1", {});
      fetchMock.put("path:/api/card/2", {});
      const { clearSelected } = setup({
        selected: [pinnedDashboard, pinnedQuestion],
      });

      await userEvent.click(screen.getByRole("button", { name: "Unpin all" }));

      await waitFor(() => {
        expect(getRequests("path:/api/dashboard/1")).toHaveLength(1);
      });
      expect(getRequests("path:/api/card/2")).toHaveLength(1);
      expect(getLastRequestBody("path:/api/card/2")).toEqual({
        collection_position: null,
      });

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
    });

    it("shows an error message when pinning fails", async () => {
      fetchMock.put("path:/api/card/3", 500);
      setup({ selected: [tableQuestion] });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Pin all"));

      expect(
        await screen.findByText("There was an error pinning these items."),
      ).toBeInTheDocument();
    });

    it("shows an error message when unpinning fails", async () => {
      fetchMock.put("path:/api/card/2", 500);
      setup({ selected: [pinnedQuestion] });

      await userEvent.click(screen.getByRole("button", { name: "Unpin all" }));

      expect(
        await screen.findByText("There was an error unpinning these items."),
      ).toBeInTheDocument();
    });

    it("disables Pin all but not Unpin all when an unpinnable item is among the unpinned", async () => {
      setup({ selected: [pinnedDashboard, childCollection] });
      await openOverflowMenu();

      expect(getMenuItem("Pin all")).toHaveAttribute("data-disabled", "true");
      expect(getMenuItem("Unpin all")).not.toHaveAttribute(
        "data-disabled",
        "true",
      );
    });
  });

  describe("bookmarking", () => {
    it("bookmarks the selected items", async () => {
      fetchMock.post("path:/api/bookmark/dashboard/1", {});
      fetchMock.post("path:/api/bookmark/card/3", {});
      fetchMock.post("path:/api/bookmark/card/7", {});
      const { clearSelected } = setup({
        selected: [pinnedDashboard, tableQuestion, tableModel],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Bookmark"));

      await waitFor(() => {
        expect(getRequests("path:/api/bookmark/dashboard/1")).toHaveLength(1);
      });
      expect(getRequests("path:/api/bookmark/card/3")).toHaveLength(1);
      expect(getRequests("path:/api/bookmark/card/7")).toHaveLength(1);

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
    });

    it("skips items that are already bookmarked", async () => {
      fetchMock.post("path:/api/bookmark/dashboard/1", {});
      setup({
        selected: [pinnedDashboard, tableQuestion],
        bookmarks: [createMockBookmark({ type: "card", item_id: 3 })],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Bookmark"));

      await waitFor(() => {
        expect(getRequests("path:/api/bookmark/dashboard/1")).toHaveLength(1);
      });
      expect(getRequests("path:/api/bookmark/card/3")).toHaveLength(0);
    });

    it("disables Bookmark when the selection has an item that cannot be bookmarked", async () => {
      setup({ selected: [pinnedDashboard, physicalTable] });
      await openOverflowMenu();

      expect(getMenuItem("Bookmark")).toHaveAttribute("data-disabled", "true");
    });

    it("disables Bookmark when every selected item is already bookmarked", async () => {
      setup({
        selected: [pinnedDashboard, tableQuestion],
        bookmarks: [
          createMockBookmark({ type: "dashboard", item_id: 1 }),
          createMockBookmark({ type: "card", item_id: 3 }),
        ],
      });
      await openOverflowMenu();

      expect(getMenuItem("Bookmark")).toHaveAttribute("data-disabled", "true");
    });

    it("shows an error message when bookmarking fails", async () => {
      fetchMock.post("path:/api/bookmark/card/3", 500);
      setup({ selected: [tableQuestion] });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Bookmark"));

      expect(
        await screen.findByText("There was an error bookmarking these items."),
      ).toBeInTheDocument();
    });
  });

  describe("duplicating", () => {
    it("duplicates the selected items into the current collection", async () => {
      fetchMock.post("path:/api/dashboard/1/copy", createMockDashboard());
      fetchMock.post("path:/api/dashboard/4/copy", createMockDashboard());
      const { clearSelected } = setup({
        selected: [pinnedDashboard, tableDashboard],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Duplicate"));

      await waitFor(() => {
        expect(getRequests("path:/api/dashboard/1/copy")).toHaveLength(1);
      });
      expect(getLastRequestBody("path:/api/dashboard/1/copy")).toEqual({
        name: "Pinned dashboard - Duplicate",
        collection_id: 1,
        is_deep_copy: false,
      });

      expect(
        await screen.findByText("2 items have been duplicated."),
      ).toBeInTheDocument();
      expect(clearSelected).toHaveBeenCalled();
    });

    it("duplicates documents through the document copy endpoint", async () => {
      fetchMock.post("path:/api/dashboard/1/copy", createMockDashboard());
      fetchMock.post(
        "path:/api/document/9/copy",
        createMockDocument({ id: 9 }),
      );
      const { clearSelected } = setup({
        selected: [pinnedDashboard, tableDocument],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Duplicate"));

      await waitFor(() => {
        expect(getRequests("path:/api/document/9/copy")).toHaveLength(1);
      });
      expect(getRequests("path:/api/dashboard/1/copy")).toHaveLength(1);
      expect(getLastRequestBody("path:/api/document/9/copy")).toEqual({
        name: "Table document - Duplicate",
        collection_id: 1,
      });

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
    });

    it("disables Duplicate when the selection has an item that cannot be duplicated", async () => {
      setup({ selected: [pinnedDashboard, tableQuestion] });
      await openOverflowMenu();

      expect(getMenuItem("Duplicate")).toHaveAttribute("data-disabled", "true");
    });
  });

  describe("deselecting", () => {
    it("clears the selection with Deselect all", async () => {
      const { clearSelected } = setup({
        selected: [pinnedDashboard, tableQuestion],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Deselect all"));

      expect(clearSelected).toHaveBeenCalled();
    });
  });

  describe("moving to trash", () => {
    it("confirms before moving the selection to trash from the overflow menu", async () => {
      fetchMock.put("path:/api/card/3", {});
      const { clearSelected } = setup({ selected: [tableQuestion] });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Move to trash"));

      const confirmation = await screen.findByTestId(
        "move-to-trash-confirmation",
      );
      expect(
        within(confirmation).getByText("Move 1 item to trash?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(confirmation).getByRole("button", { name: "Move to trash" }),
      );

      await waitFor(() => {
        expect(getRequests("path:/api/card/3")).toHaveLength(1);
      });
      expect(getLastRequestBody("path:/api/card/3")).toMatchObject({
        archived: true,
      });

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
    });

    it("keeps the selection when the trash confirmation is cancelled", async () => {
      const { clearSelected } = setup({ selected: [tableQuestion] });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Move to trash"));

      const confirmation = await screen.findByTestId(
        "move-to-trash-confirmation",
      );
      await userEvent.click(
        within(confirmation).getByRole("button", { name: "Cancel" }),
      );

      expect(clearSelected).not.toHaveBeenCalled();
      expect(getRequests("path:/api/card/3")).toHaveLength(0);
    });

    it("disables the overflow actions in a read-only collection", async () => {
      setup({
        selected: [pinnedQuestion],
        collection: createMockCollection({
          ...writableCollection,
          can_write: false,
        }),
      });

      expect(screen.getByRole("button", { name: "Unpin all" })).toBeDisabled();

      await openOverflowMenu();
      expect(getMenuItem("Move to trash")).toHaveAttribute(
        "data-disabled",
        "true",
      );
      expect(getMenuItem("Move")).toHaveAttribute("data-disabled", "true");
    });
  });

  describe("moving", () => {
    it("enables the Move button for a movable selection", () => {
      setup({ selected: [pinnedDashboard, tableQuestion] });

      expect(screen.getByRole("button", { name: "Move" })).toBeEnabled();
    });

    it("tracks items moved to another collection from the move modal", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      setupMovePickerEndpoints();
      setupCardEndpoints(
        createMockCard({
          id: tableQuestion.id,
          name: tableQuestion.name,
          collection_id: writableCollection.id,
        }),
      );
      setup({ selected: [tableQuestion] });

      await userEvent.click(screen.getByRole("button", { name: "Move" }));
      await waitForLoaderToBeRemoved();
      await userEvent.click(await screen.findByText("Our analytics"));
      await userEvent.click(
        await screen.findByText(destinationCollection.name),
      );
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Move",
        }),
      );

      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "collection_item_moved",
          event_detail: "question",
          target_id: tableQuestion.id,
          triggered_from: "move_modal",
          result: "success",
        });
      });
    });
  });
});

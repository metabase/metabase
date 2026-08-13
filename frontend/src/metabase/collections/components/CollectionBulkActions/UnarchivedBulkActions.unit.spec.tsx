import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import {
  createMockBookmark,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDocument,
} from "metabase-types/api/mocks";

import { UnarchivedBulkActions } from "./UnarchivedBulkActions";

const writableCollection = createMockCollection({
  id: 1,
  name: "Writable collection",
  can_write: true,
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
  const setSelectedItems = jest.fn();
  const setSelectedAction = jest.fn();

  renderWithProviders(
    <UnarchivedBulkActions
      selected={selected}
      collection={collection}
      bookmarks={bookmarks}
      clearSelected={clearSelected}
      setSelectedItems={setSelectedItems}
      setSelectedAction={setSelectedAction}
    />,
    { withUndos: true },
  );

  return { clearSelected, setSelectedItems, setSelectedAction };
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

function queryMenuItem(name: string) {
  return screen.queryByRole("menuitem", { name });
}

describe("UnarchivedBulkActions", () => {
  describe("selection composition", () => {
    it("offers Pin all but not Unpin all for an unpinned-only selection", async () => {
      setup({ selected: [tableQuestion, tableDashboard] });
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

    it("offers Unpin all but not Pin all for a pinned-only selection", async () => {
      setup({ selected: [pinnedDashboard, pinnedQuestion] });
      await openOverflowMenu();

      expect(getMenuItem("Unpin all")).toBeInTheDocument();
      expect(queryMenuItem("Pin all")).not.toBeInTheDocument();
    });

    it("offers both Pin all and Unpin all for a mixed selection", async () => {
      setup({ selected: [pinnedDashboard, tableQuestion] });
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
    });

    it("unpins only the pinned items with Unpin all", async () => {
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
    });

    it("disables Pin all when the selection has an item that cannot be pinned", async () => {
      setup({ selected: [childCollection, tableQuestion] });
      await openOverflowMenu();

      expect(getMenuItem("Pin all")).toHaveAttribute("data-disabled", "true");
    });

    it("keeps Unpin all enabled when an unpinnable item is among the unpinned", async () => {
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
      fetchMock.post("path:/api/bookmark/card/3", {});
      fetchMock.post("path:/api/bookmark/dashboard/4", {});
      fetchMock.post("path:/api/bookmark/card/7", {});
      const { clearSelected } = setup({
        selected: [tableQuestion, tableDashboard, tableModel],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Bookmark"));

      await waitFor(() => {
        expect(getRequests("path:/api/bookmark/card/3")).toHaveLength(1);
      });
      expect(getRequests("path:/api/bookmark/dashboard/4")).toHaveLength(1);
      expect(getRequests("path:/api/bookmark/card/7")).toHaveLength(1);

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
    });

    it("skips items that are already bookmarked", async () => {
      fetchMock.post("path:/api/bookmark/dashboard/4", {});
      setup({
        selected: [tableQuestion, tableDashboard],
        bookmarks: [createMockBookmark({ type: "card", item_id: 3 })],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Bookmark"));

      await waitFor(() => {
        expect(getRequests("path:/api/bookmark/dashboard/4")).toHaveLength(1);
      });
      expect(getRequests("path:/api/bookmark/card/3")).toHaveLength(0);
    });

    it("disables Bookmark when the selection has an item that cannot be bookmarked", async () => {
      setup({ selected: [tableQuestion, physicalTable] });
      await openOverflowMenu();

      expect(getMenuItem("Bookmark")).toHaveAttribute("data-disabled", "true");
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
      fetchMock.post("path:/api/dashboard/4/copy", createMockDashboard());
      fetchMock.post(
        "path:/api/document/9/copy",
        createMockDocument({ id: 9 }),
      );
      const { clearSelected } = setup({
        selected: [tableDashboard, tableDocument],
      });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Duplicate"));

      await waitFor(() => {
        expect(getRequests("path:/api/document/9/copy")).toHaveLength(1);
      });
      expect(getRequests("path:/api/dashboard/4/copy")).toHaveLength(1);
      expect(getLastRequestBody("path:/api/document/9/copy")).toEqual({
        name: "Table document - Duplicate",
        collection_id: 1,
      });

      await waitFor(() => {
        expect(clearSelected).toHaveBeenCalled();
      });
    });

    it("disables Duplicate when the selection has an item that cannot be duplicated", async () => {
      setup({ selected: [tableQuestion, tableDashboard] });
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
    it("moves the selection to trash from the overflow menu", async () => {
      fetchMock.put("path:/api/card/3", {});
      const { clearSelected } = setup({ selected: [tableQuestion] });

      await openOverflowMenu();
      await userEvent.click(getMenuItem("Move to trash"));

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

    it("disables Move to trash in a read-only collection", async () => {
      setup({
        selected: [tableQuestion],
        collection: createMockCollection({
          ...writableCollection,
          can_write: false,
        }),
      });
      await openOverflowMenu();

      expect(getMenuItem("Move to trash")).toHaveAttribute(
        "data-disabled",
        "true",
      );
    });
  });

  describe("moving", () => {
    it("starts a bulk move with the Move button", async () => {
      const selected = [pinnedDashboard, tableQuestion];
      const { setSelectedItems, setSelectedAction } = setup({ selected });

      await userEvent.click(screen.getByRole("button", { name: "Move" }));

      expect(setSelectedItems).toHaveBeenCalledWith(selected);
      expect(setSelectedAction).toHaveBeenCalledWith("move");
    });
  });
});

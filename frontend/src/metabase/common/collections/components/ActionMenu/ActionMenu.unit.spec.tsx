import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockEntitiesState } from "__support__/store";
import { getIcon, queryIcon, renderWithProviders } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { Collection, CollectionItem, Database } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDocument,
} from "metabase-types/api/mocks";

import { ActionMenu } from "./ActionMenu";

interface SetupOpts {
  item: CollectionItem;
  collection?: Collection;
  databases?: Database[];
  isXrayEnabled?: boolean;
  withBookmarks?: boolean;
  isSelected?: boolean;
  onToggleSelected?: jest.Mock;
}

const setup = ({
  item,
  collection = createMockCollection({ can_write: true }),
  databases = [],
  isXrayEnabled = false,
  withBookmarks = false,
  isSelected,
  onToggleSelected,
}: SetupOpts) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases,
    }),
    settings: createMockSettingsState({
      "enable-xrays": isXrayEnabled,
    }),
  });

  const onCopy = jest.fn();
  const onMove = jest.fn();
  const createBookmark = withBookmarks ? jest.fn() : undefined;
  const deleteBookmark = withBookmarks ? jest.fn() : undefined;

  renderWithProviders(
    <ActionMenu
      item={item}
      collection={collection}
      databases={databases}
      onCopy={onCopy}
      onMove={onMove}
      createBookmark={createBookmark}
      deleteBookmark={deleteBookmark}
      isSelected={isSelected}
      onToggleSelected={onToggleSelected}
    />,
    { storeInitialState },
  );

  return { onCopy, onMove, createBookmark, deleteBookmark };
};

describe("ActionMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("bookmarks", () => {
    it("should bookmark an item with its id and model", async () => {
      const item = createMockCollectionItem({
        id: 1,
        name: "Dashboard",
        model: "dashboard",
        can_write: true,
      });

      const { createBookmark } = setup({ item, withBookmarks: true });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Bookmark"));

      expect(createBookmark).toHaveBeenCalledWith({ id: 1, type: "dashboard" });
    });
  });

  describe("pinning", () => {
    it("tracks a successful pin", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      const item = createMockCollectionItem({
        id: 1,
        name: "Dashboard",
        model: "dashboard",
        collection_position: null,
      });
      fetchMock.put("path:/api/dashboard/1", {});
      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Pin this"));

      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "collection_item_pinned",
          event_detail: "dashboard",
          target_id: item.id,
          triggered_from: "item_menu",
          result: "success",
        });
      });
    });

    it("tracks a successful unpin and normalizes questions", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      const item = createMockCollectionItem({
        id: 2,
        name: "Question",
        model: "card",
        collection_position: 1,
      });
      fetchMock.put("path:/api/card/2", {});
      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Unpin"));

      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "collection_item_unpinned",
          event_detail: "question",
          target_id: item.id,
          triggered_from: "item_menu",
          result: "success",
        });
      });
    });

    it("tracks a failed pin", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      const item = createMockCollectionItem({
        id: 3,
        name: "Dashboard",
        model: "dashboard",
        collection_position: null,
      });
      fetchMock.put("path:/api/dashboard/3", {
        status: 500,
        body: { message: "Something went wrong" },
      });
      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Pin this"));

      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "collection_item_pinned",
          event_detail: "dashboard",
          target_id: item.id,
          triggered_from: "item_menu",
          result: "failure",
        });
      });
    });
  });

  describe("selection", () => {
    const item = createMockCollectionItem({
      id: 1,
      name: "Dashboard",
      model: "dashboard",
      can_write: true,
    });

    it("should select an item in a writable collection", async () => {
      const onToggleSelected = jest.fn();
      setup({ item, onToggleSelected });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Select"));

      expect(onToggleSelected).toHaveBeenCalledTimes(1);
      expect(onToggleSelected).toHaveBeenCalledWith();
    });

    it("should show Deselect for a selected item", async () => {
      setup({ item, isSelected: true, onToggleSelected: jest.fn() });

      await userEvent.click(getIcon("ellipsis"));

      expect(await screen.findByText("Deselect")).toBeInTheDocument();
    });

    it("should not show selection in a read-only collection", async () => {
      setup({
        item,
        collection: createMockCollection({ can_write: false }),
        onToggleSelected: jest.fn(),
      });

      await userEvent.click(getIcon("ellipsis"));

      expect(screen.queryByText("Select")).not.toBeInTheDocument();
      expect(screen.queryByText("Deselect")).not.toBeInTheDocument();
    });

    it("should not show selection without a toggle callback", async () => {
      setup({ item });

      await userEvent.click(getIcon("ellipsis"));

      expect(screen.queryByText("Select")).not.toBeInTheDocument();
      expect(screen.queryByText("Deselect")).not.toBeInTheDocument();
    });
  });

  describe("moving and archiving", () => {
    it("should duplicate an item", async () => {
      const item = createMockCollectionItem({
        id: 1,
        name: "Dashboard",
        model: "dashboard",
        can_write: true,
      });

      const { onCopy } = setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Duplicate"));

      expect(onCopy).toHaveBeenCalledWith([item]);
    });

    it("should allow to move and archive regular collections", async () => {
      const item = createMockCollectionItem({
        id: 1,
        name: "Collection",
        model: "collection",
        can_write: true,
      });
      fetchMock.put("path:/api/collection/1", { ...item, archived: true });

      const { onMove } = setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move"));
      expect(onMove).toHaveBeenCalledWith([item]);

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move to trash"));

      const calls = fetchMock.callHistory.calls("path:/api/collection/1");
      expect(calls).toHaveLength(1);
      const [putCall] = calls;
      expect(putCall.options.method).toBe("PUT");
      // Unjustified type cast. FIXME
      expect(JSON.parse(putCall.options.body as string)).toMatchObject({
        archived: true,
      });
    });

    it("should not allow to move and archive personal collections", async () => {
      const item = createMockCollectionItem({
        name: "My personal collection",
        model: "collection",
        can_write: true,
        personal_owner_id: 1,
      });

      setup({ item, withBookmarks: true });

      await userEvent.click(getIcon("ellipsis"));

      expect(await screen.findByText("Bookmark")).toBeInTheDocument();
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
    });

    it("should not allow to move and archive read only collections", async () => {
      const item = createMockCollectionItem({
        name: "My Read Only collection",
        model: "collection",
        can_write: false,
      });

      setup({ item, withBookmarks: true });

      await userEvent.click(getIcon("ellipsis"));

      expect(await screen.findByText("Bookmark")).toBeInTheDocument();
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
    });

    it("should not render the menu at all when no actions are available", () => {
      const item = createMockCollectionItem({
        name: "My Read Only collection",
        model: "collection",
        can_write: false,
      });

      setup({ item, withBookmarks: false });

      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
    });
  });

  describe("x-rays", () => {
    it("should allow to x-ray a model when xrays are enabled", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
      });

      setup({ item, isXrayEnabled: true });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByText("X-ray this")).toBeInTheDocument();
    });

    it("should not allow to x-ray a model when xrays are not enabled", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
      });

      setup({ item, isXrayEnabled: false });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });

    it("should not allow to x-ray a question when xrays are enabled", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "card",
      });

      setup({ item, isXrayEnabled: true });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });

    it("should not allow to x-ray non-models", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dashboard",
      });

      setup({ item, isXrayEnabled: true });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });
  });

  describe("trashed documents", () => {
    it("should restore a document via PUT /api/document/:id with archived: false", async () => {
      const item = createMockCollectionItem({
        id: 7,
        name: "Trashed doc",
        model: "document",
        can_restore: true,
        archived: true,
      });
      fetchMock.put(
        "path:/api/document/7",
        createMockDocument({ id: 7, archived: false, collection_id: null }),
      );

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Restore"));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls("path:/api/document/7", {
          method: "PUT",
        });
        expect(calls).toHaveLength(1);
      });

      const [putCall] = fetchMock.callHistory.calls("path:/api/document/7", {
        method: "PUT",
      });
      // Unjustified type cast. FIXME
      expect(JSON.parse(putCall.options.body as string)).toMatchObject({
        archived: false,
      });
    });

    it("should permanently delete a document via DELETE /api/document/:id", async () => {
      const item = createMockCollectionItem({
        id: 7,
        name: "Trashed doc",
        model: "document",
        can_delete: true,
        archived: true,
      });
      fetchMock.delete("path:/api/document/7", 204);

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Delete permanently"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete permanently" }),
      );

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls("path:/api/document/7", {
          method: "DELETE",
        });
        expect(calls).toHaveLength(1);
      });
    });
  });

  describe("tables", () => {
    it("should not allow actions on a table", () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "table",
      });

      setup({ item });

      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
    });
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, queryIcon, renderWithProviders } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  Database,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDocument,
} from "metabase-types/api/mocks";

import ActionMenu from "./ActionMenu";

interface SetupOpts {
  item: CollectionItem;
  collection?: Collection;
  databases?: Database[];
  isXrayEnabled?: boolean;
}

const setup = ({
  item,
  collection = createMockCollection({ can_write: true }),
  databases = [],
  isXrayEnabled = false,
}: SetupOpts) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases,
    }),
    settings: createMockSettingsState({
      "enable-xrays": isXrayEnabled,
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const onCopy = jest.fn();
  const onMove = jest.fn();

  renderWithProviders(
    <ActionMenu
      item={item}
      collection={collection}
      databases={metadata.databasesList()}
      onCopy={onCopy}
      onMove={onMove}
    />,
    { storeInitialState },
  );

  return { onCopy, onMove };
};

describe("ActionMenu", () => {
  describe("preview", () => {
    it.each<CollectionItemModel>(["card", "metric"])(
      "should show an option to hide preview for a pinned %s",
      async (model) => {
        const item = createMockCollectionItem({
          model,
          collection_position: 1,
          collection_preview: true,
        });
        setupCardEndpoints(createMockCard({ id: item.id }));

        setup({ item });

        await userEvent.click(getIcon("ellipsis"));
        await userEvent.click(
          await screen.findByText("Don’t show visualization"),
        );

        await waitFor(() =>
          expect(
            fetchMock.callHistory.calls(`path:/api/card/${item.id}`, {
              method: "PUT",
            }),
          ).toHaveLength(1),
        );
        const call = fetchMock.callHistory.lastCall(
          `path:/api/card/${item.id}`,
          { method: "PUT" },
        );
        expect(JSON.parse(call?.options.body as string)).toEqual({
          collection_preview: false,
        });
      },
    );

    it("should show a tooltip for the disabled preview action", async () => {
      const item = createMockCollectionItem({
        collection_position: 1,
        collection_preview: false,
        fully_parameterized: false,
      });
      setupCardEndpoints(createMockCard({ id: item.id }));

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      const menuItem = await screen.findByText("Show visualization");
      await userEvent.hover(menuItem);

      const tooltip = await screen.findByText(
        "Open this question and fill in its variables to see it.",
      );
      await waitFor(() => expect(tooltip).toBeVisible());

      await userEvent.click(menuItem);

      expect(
        fetchMock.callHistory.calls(`path:/api/card/${item.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(0);
    });

    it.each<CollectionItemModel>(["card", "metric"])(
      "should show an option to show preview for a pinned %s",
      async (model) => {
        const item = createMockCollectionItem({
          model,
          collection_position: 1,
          collection_preview: false,
        });
        setupCardEndpoints(createMockCard({ id: item.id }));

        setup({ item });

        await userEvent.click(getIcon("ellipsis"));
        await userEvent.click(await screen.findByText("Show visualization"));

        await waitFor(() =>
          expect(
            fetchMock.callHistory.calls(`path:/api/card/${item.id}`, {
              method: "PUT",
            }),
          ).toHaveLength(1),
        );
        const call = fetchMock.callHistory.lastCall(
          `path:/api/card/${item.id}`,
          { method: "PUT" },
        );
        expect(JSON.parse(call?.options.body as string)).toEqual({
          collection_preview: true,
        });
      },
    );

    it("should not show an option to hide preview for a pinned model", async () => {
      setup({
        item: createMockCollectionItem({
          model: "dataset",
          collection_position: 1,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));

      expect(
        screen.queryByText("Don’t show visualization"),
      ).not.toBeInTheDocument();
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

      setup({ item });

      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
    });

    it("should not allow to move and archive read only collections", async () => {
      const item = createMockCollectionItem({
        name: "My Read Only collection",
        model: "collection",
        can_write: false,
      });

      setup({ item });

      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
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

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import type { Collection, CollectionItem, Database } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import ActionMenu from "./ActionMenu";

interface SetupOpts {
  item: CollectionItem;
  collection?: Collection;
  databases?: Database[];
  isXrayEnabled?: boolean;
  isMetabotEnabled?: boolean;
}

const setup = ({
  item,
  collection = createMockCollection({ can_write: true }),
  databases = [],
  isXrayEnabled = false,
  isMetabotEnabled = false,
}: SetupOpts) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases,
    }),
    settings: createMockSettingsState({
      "enable-xrays": isXrayEnabled,
      "is-metabot-enabled": isMetabotEnabled,
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
    it("should show an option to hide preview for a pinned question", async () => {
      const item = createMockCollectionItem({
        model: "card",
        collection_position: 1,
        collection_preview: true,
        setCollectionPreview: jest.fn(),
      });

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(
        await screen.findByText("Don’t show visualization"),
      );

      expect(item.setCollectionPreview).toHaveBeenCalledWith(false);
    });

    it("should show an option to show preview for a pinned question", async () => {
      const item = createMockCollectionItem({
        model: "card",
        collection_position: 1,
        collection_preview: false,
        setCollectionPreview: jest.fn(),
      });

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Show visualization"));

      expect(item.setCollectionPreview).toHaveBeenCalledWith(true);
    });

    it("should not show an option to hide preview for a pinned model", async () => {
      setup({
        item: createMockCollectionItem({
          model: "dataset",
          collection_position: 1,
          setCollectionPreview: jest.fn(),
        }),
      });

      await userEvent.click(getIcon("ellipsis"));

      expect(
        screen.queryByText("Don’t show visualization"),
      ).not.toBeInTheDocument();
    });
  });

  describe("moving and archiving", () => {
    it("should allow to move and archive regular collections", async () => {
      const item = createMockCollectionItem({
        name: "Collection",
        model: "collection",
        can_write: true,
        setCollection: jest.fn(),
        setArchived: jest.fn(),
      });

      const { onMove } = setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move"));
      expect(onMove).toHaveBeenCalledWith([item]);

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Archive"));
      expect(item.setArchived).toHaveBeenCalledWith(true);
    });

    it("should not allow to move and archive personal collections", async () => {
      const item = createMockCollectionItem({
        name: "My personal collection",
        model: "collection",
        can_write: true,
        personal_owner_id: 1,
        setCollection: jest.fn(),
        setArchived: jest.fn(),
        copy: true,
      });

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    });

    it("should not allow to move and archive read only collections", async () => {
      const item = createMockCollectionItem({
        name: "My Read Only collection",
        model: "collection",
        can_write: false,
        setCollection: jest.fn(),
        setArchived: jest.fn(),
        copy: true,
      });

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Archive")).not.toBeInTheDocument();
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

  describe("metabot", () => {
    const setupMetabot = (
      isEnabled: boolean,
      databaseOpts: Partial<Database>,
    ) => {
      const database = createMockDatabase({
        id: 1,
        ...databaseOpts,
      });

      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
        database_id: database.id,
      });

      setup({
        item,
        databases: [database],
        isMetabotEnabled: isEnabled,
      });
    };

    it("should allow to ask metabot when it is enabled and there is native write access", async () => {
      setupMetabot(true, {
        native_permissions: "write",
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByText("Ask Metabot")).toBeInTheDocument();
    });

    it("should not allow to ask metabot when it is not enabled but there is native write access", async () => {
      setupMetabot(false, {
        native_permissions: "write",
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot when it is enabled but there is no native write access", async () => {
      setupMetabot(true, {
        native_permissions: "none",
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot for non-sql databases", async () => {
      setupMetabot(true, {
        engine: "mongo",
        native_permissions: "write",
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot for sql databases without nested-queries support", async () => {
      setupMetabot(true, {
        native_permissions: "write",
        features: [],
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot when it is enabled but there is no data access", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
        database_id: 1,
      });

      setup({
        item,
        databases: [],
        isMetabotEnabled: true,
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });
  });
});

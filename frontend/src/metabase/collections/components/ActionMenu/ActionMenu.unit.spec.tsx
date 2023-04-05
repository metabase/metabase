import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getMetadata } from "metabase/selectors/metadata";
import { getIcon, renderWithProviders } from "__support__/ui";
import { Collection, CollectionItem, Database } from "metabase-types/api";

import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import {
  createMockEntitiesState,
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
  );

  return { onCopy, onMove };
};

describe("ActionMenu", () => {
  it("should show an option to hide preview for a pinned question", () => {
    const item = createMockCollectionItem({
      model: "card",
      collection_position: 1,
      collection_preview: true,
      setCollectionPreview: jest.fn(),
    });

    setup({ item });

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Don’t show visualization"));

    expect(item.setCollectionPreview).toHaveBeenCalledWith(false);
  });

  it("should show an option to show preview for a pinned question", () => {
    const item = createMockCollectionItem({
      model: "card",
      collection_position: 1,
      collection_preview: false,
      setCollectionPreview: jest.fn(),
    });

    setup({ item });

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Show visualization"));

    expect(item.setCollectionPreview).toHaveBeenCalledWith(true);
  });

  it("should not show an option to hide preview for a pinned model", () => {
    setup({
      item: createMockCollectionItem({
        model: "dataset",
        collection_position: 1,
        setCollectionPreview: jest.fn(),
      }),
    });

    userEvent.click(screen.getByLabelText("ellipsis icon"));

    expect(
      screen.queryByText("Don’t show visualization"),
    ).not.toBeInTheDocument();
  });

  it("should allow to move and archive regular collections", () => {
    const item = createMockCollectionItem({
      name: "Collection",
      model: "collection",
      setCollection: jest.fn(),
      setArchived: jest.fn(),
    });

    const { onMove } = setup({ item });

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Move"));
    expect(onMove).toHaveBeenCalledWith([item]);

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Archive"));
    expect(item.setArchived).toHaveBeenCalledWith(true);
  });

  it("should not allow to move and archive personal collections", () => {
    const item = createMockCollectionItem({
      name: "My personal collection",
      model: "collection",
      personal_owner_id: 1,
      setCollection: jest.fn(),
      setArchived: jest.fn(),
    });

    setup({ item });

    userEvent.click(screen.getByLabelText("ellipsis icon"));
    expect(screen.queryByText("Move")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
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

    it("should allow to ask metabot when it is enabled and there is native write access", () => {
      setupMetabot(true, {
        native_permissions: "write",
      });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.getByText("Ask Metabot")).toBeInTheDocument();
    });

    it("should not allow to ask metabot when it is not enabled but there is native write access", () => {
      setupMetabot(false, {
        native_permissions: "write",
      });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot when it is enabled but there is no native write access", () => {
      setupMetabot(true, {
        native_permissions: "none",
      });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot for non-sql databases", () => {
      setupMetabot(true, {
        engine: "mongo",
        native_permissions: "write",
      });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot for sql databases without nested-queries support", () => {
      setupMetabot(true, {
        native_permissions: "write",
        features: [],
      });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });

    it("should not allow to ask metabot when it is enabled but there is no data access", () => {
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

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
    });
  });
});

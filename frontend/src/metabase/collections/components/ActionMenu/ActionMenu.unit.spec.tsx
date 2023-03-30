import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders } from "__support__/ui";
import { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import ActionMenu from "./ActionMenu";

interface SetupOpts {
  item: CollectionItem;
  collection?: Collection;
  isXrayAvailable?: boolean;
}

const setup = ({
  item,
  collection = createMockCollection({ can_write: true }),
  isXrayAvailable = false,
}: SetupOpts) => {
  const storeInitialState = createMockState({
    settings: createMockSettingsState({
      "enable-xrays": isXrayAvailable,
    }),
  });

  const onCopy = jest.fn();
  const onMove = jest.fn();

  renderWithProviders(
    <ActionMenu
      item={item}
      collection={collection}
      onCopy={onCopy}
      onMove={onMove}
    />,
    { storeInitialState },
  );

  return { onCopy, onMove };
};

describe("ActionMenu", () => {
  describe("preview", () => {
    it("should show an option to hide preview for a pinned question", () => {
      const item = createMockCollectionItem({
        model: "card",
        collection_position: 1,
        collection_preview: true,
        setCollectionPreview: jest.fn(),
      });

      setup({ item });

      userEvent.click(getIcon("ellipsis"));
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

      userEvent.click(getIcon("ellipsis"));
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

      userEvent.click(getIcon("ellipsis"));

      expect(
        screen.queryByText("Don’t show visualization"),
      ).not.toBeInTheDocument();
    });
  });

  describe("moving and archiving", () => {
    it("should allow to move and archive regular collections", () => {
      const item = createMockCollectionItem({
        name: "Collection",
        model: "collection",
        setCollection: jest.fn(),
        setArchived: jest.fn(),
      });

      const { onMove } = setup({ item });

      userEvent.click(getIcon("ellipsis"));
      userEvent.click(screen.getByText("Move"));
      expect(onMove).toHaveBeenCalledWith([item]);

      userEvent.click(getIcon("ellipsis"));
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

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    });
  });

  describe("x-rays", () => {
    it("should allow to x-ray a model when xrays are enabled", () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
      });

      setup({ item, isXrayAvailable: true });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.getByText("X-ray this")).toBeInTheDocument();
    });

    it("should not allow to x-ray a model when xrays are not enabled", () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
      });

      setup({ item, isXrayAvailable: false });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });

    it("should not allow to x-ray a question when xrays are enabled", () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "card",
      });

      setup({ item, isXrayAvailable: true });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });

    it("should not allow to x-ray non-models", () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dashboard",
      });

      setup({ item, isXrayAvailable: true });

      userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });
  });
});

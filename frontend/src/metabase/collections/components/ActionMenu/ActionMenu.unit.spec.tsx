import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";
import ActionMenu from "./ActionMenu";

interface SetupOpts {
  item: CollectionItem;
  collection?: Collection;
}

const setup = ({
  item,
  collection = createMockCollection({ can_write: true }),
}: SetupOpts) => {
  const onCopy = jest.fn();
  const onMove = jest.fn();

  renderWithProviders(
    <ActionMenu
      item={item}
      collection={collection}
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
      name: "My personal collection",
      model: "collection",
      setArchived: jest.fn(),
      personal_owner_id: 1,
    });

    setup({ item });

    expect(screen.queryByLabelText("Move")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Archive")).not.toBeInTheDocument();
  });
});

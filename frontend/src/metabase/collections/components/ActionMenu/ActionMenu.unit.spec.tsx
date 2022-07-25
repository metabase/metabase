import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";
import ActionMenu, { ActionMenuProps } from "./ActionMenu";

describe("ActionMenu", () => {
  it("should show an option to hide preview for a pinned question", () => {
    const props = getProps({
      item: createMockCollectionItem({
        model: "card",
        collection_position: 1,
        collection_preview: true,
        setCollectionPreview: jest.fn(),
      }),
      collection: createMockCollection({
        can_write: true,
      }),
    });

    render(<ActionMenu {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Don’t show visualization"));

    expect(props.item.setCollectionPreview).toHaveBeenCalledWith(false);
  });

  it("should show an option to show preview for a pinned question", () => {
    const props = getProps({
      item: createMockCollectionItem({
        model: "card",
        collection_position: 1,
        collection_preview: false,
        setCollectionPreview: jest.fn(),
      }),
      collection: createMockCollection({
        can_write: true,
      }),
    });

    render(<ActionMenu {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));
    userEvent.click(screen.getByText("Show visualization"));

    expect(props.item.setCollectionPreview).toHaveBeenCalledWith(true);
  });

  it("should not show an option to hide preview for a pinned model", () => {
    const props = getProps({
      item: createMockCollectionItem({
        model: "model",
        collection_position: 1,
        setCollectionPreview: jest.fn(),
      }),
      collection: createMockCollection({
        can_write: true,
      }),
    });

    render(<ActionMenu {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));

    expect(
      screen.queryByText("Don’t show visualization"),
    ).not.toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<ActionMenuProps>): ActionMenuProps => ({
  item: createMockCollectionItem(),
  collection: createMockCollection(),
  onCopy: jest.fn(),
  onMove: jest.fn(),
  ...opts,
});

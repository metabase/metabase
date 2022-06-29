import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import { createMockCollection } from "metabase-types/api/mocks";
import CollectionHeader, { CollectionHeaderProps } from "./CollectionHeader";

describe("CollectionHeader", () => {
  it("should edit name", () => {
    const props = getProps({
      collection: createMockCollection({
        name: "Name",
        can_write: true,
      }),
    });

    render(<CollectionHeader {...props} />);

    const input = screen.getByDisplayValue("Name");
    userEvent.clear(input);
    userEvent.type(input, `New name${specialChars.enter}`);

    expect(props.onUpdateCollection).toHaveBeenCalledWith(props.collection, {
      name: "New name",
    });
  });

  it("should edit description", () => {
    const props = getProps({
      collection: createMockCollection({
        description: "Description",
        can_write: true,
      }),
    });

    render(<CollectionHeader {...props} />);

    const input = screen.getByDisplayValue("Description");
    userEvent.clear(input);
    userEvent.type(input, "New description");
    userEvent.tab();

    expect(props.onUpdateCollection).toHaveBeenCalledWith(props.collection, {
      description: "New description",
    });
  });
});

const getProps = (
  opts?: Partial<CollectionHeaderProps>,
): CollectionHeaderProps => ({
  collection: createMockCollection(),
  isAdmin: false,
  isBookmarked: false,
  isPersonalCollectionChild: false,
  onUpdateCollection: jest.fn(),
  onCreateBookmark: jest.fn(),
  onDeleteBookmark: jest.fn(),
  ...opts,
});

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent, { specialChars } from "@testing-library/user-event";
import { createMockCollection } from "metabase-types/api/mocks";
import CollectionHeader, { CollectionHeaderProps } from "./CollectionHeader";

describe("CollectionHeader", () => {
  describe("collection name", () => {
    it("should be able to edit name with write access", () => {
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

    it("should not be able to edit name without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          name: "Name",
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Name");
      expect(input).toBeDisabled();
    });

    it("should not be able to edit name for the root collection", () => {
      const props = getProps({
        collection: createMockCollection({
          id: "root",
          name: "Our analytics",
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Our analytics");
      expect(input).toBeDisabled();
    });

    it("should not be able to edit name for personal collections", () => {
      const props = getProps({
        collection: createMockCollection({
          name: "Personal collection",
          personal_owner_id: 1,
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Personal collection");
      expect(input).toBeDisabled();
    });
  });

  describe("collection description", () => {
    it("should be able to edit description with write access", () => {
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

    it("should be able to add description with write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: null,
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByPlaceholderText("Add description");
      userEvent.type(input, "New description");
      userEvent.tab();

      expect(props.onUpdateCollection).toHaveBeenCalledWith(props.collection, {
        description: "New description",
      });
    });

    it("should not be able to add description without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: null,
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.queryByPlaceholderText("Add description");
      expect(input).not.toBeInTheDocument();
    });

    it("should be able to view the description without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: "Description",
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Description");
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
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

import userEvent from "@testing-library/user-event";
import { createMockCollection } from "metabase-types/api/mocks";
import { getIcon, queryIcon, screen } from "__support__/ui";
import { setup } from "./setup";

describe("CollectionMenu", () => {
  it("should be able to edit collection permissions with admin access", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Edit permissions")).toBeInTheDocument();
  });

  it("should not be able to edit collection permissions without admin access", () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: false,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
  });

  it("should not be able to edit permissions for personal collections", () => {
    setup({
      collection: createMockCollection({
        personal_owner_id: 1,
        can_write: true,
      }),
      isAdmin: true,
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to edit permissions for personal subcollections", () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
      isPersonalCollectionChild: true,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
  });

  it("should be able to move and archive a collection with write access", async () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
    });

    userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("should not be able to move and archive a collection without write access", () => {
    setup({
      collection: createMockCollection({
        can_write: false,
      }),
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to move and archive the root collection", () => {
    setup({
      collection: createMockCollection({
        id: "root",
        name: "Our analytics",
        can_write: true,
      }),
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to move and archive personal collections", () => {
    setup({
      collection: createMockCollection({
        personal_owner_id: 1,
        can_write: true,
      }),
    });

    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });

  it("should not be able to make the collection official", () => {
    setup({
      collection: createMockCollection({
        can_write: true,
      }),
      isAdmin: true,
    });

    userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });
});

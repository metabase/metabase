import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen, within } from "__support__/ui";
import type { CollectionType } from "metabase-types/api";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { setup } from "./setup";

describe("Instance Analytics Collection Header", () => {
  const defaultOptions = {
    collection: {
      name: "Usage Analytics",
      // Unjustified type cast. FIXME
      type: "instance-analytics" as CollectionType,
      can_write: false,
    },
    enterprisePlugins: ["audit_app" as const, "collections" as const],
    tokenFeatures: { audit_app: true },
  };

  it("should not offer to create new collection for instance analytics collections", () => {
    setup(defaultOptions);
    const headerMenu = screen.getByTestId("collection-menu");
    expect(
      within(headerMenu).queryByLabelText("Create a new collection"),
    ).not.toBeInTheDocument();
  });

  it("should show an audit icon for instance analytics collections", () => {
    setup(defaultOptions);
    expect(getIcon("audit")).toBeInTheDocument();
  });

  it("should not show an audit icon for regular collections", () => {
    setup({
      ...defaultOptions,
      collection: {
        name: "Rock Collection",
        type: null,
      },
    });
    expect(queryIcon("audit")).not.toBeInTheDocument();
  });

  it("should show bookmark icon for instance analytics", () => {
    setup(defaultOptions);
    expect(getIcon("bookmark")).toBeInTheDocument();
  });

  it("should show permissions icon for instance analytics", () => {
    setup(defaultOptions);
    expect(getIcon("lock")).toBeInTheDocument();
  });

  it("should not show upload icon for instance analytics", () => {
    setup(defaultOptions);
    expect(queryIcon("upload")).not.toBeInTheDocument();
  });

  it("should not show timeline events icon for instance analytics", () => {
    setup(defaultOptions);
    expect(queryIcon("calendar")).not.toBeInTheDocument();
  });

  it("should not show rest ... menu for instance analytics", () => {
    setup(defaultOptions);
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });
});

describe("instance analytics custom reports collection", () => {
  const defaultOptions = {
    collection: {
      name: "Custom Reports",
      can_write: true,
      entity_id: createMockEntityId("okNLSZKdSxaoG58JSQY54"),
    },
    enterprisePlugins: "*" as const, // TODO: specify exact plugins needed
    tokenFeatures: { audit_app: true },
    isAdmin: true,
  };

  it("should not show move button", async () => {
    setup(defaultOptions);
    await userEvent.click(getIcon("ellipsis"));
    await screen.findByRole("menu");

    expect(getIcon("lock")).toBeInTheDocument();
    expect(queryIcon("move")).not.toBeInTheDocument();
    expect(screen.queryByText("Move")).not.toBeInTheDocument();
  });

  it("should not show archive button", async () => {
    setup(defaultOptions);
    await userEvent.click(getIcon("ellipsis"));
    await screen.findByRole("menu");

    expect(getIcon("lock")).toBeInTheDocument();
    expect(queryIcon("archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });
});

describe("Official Collections Header", () => {
  const syncedCollectionOptions = {
    collection: {
      id: 144,
      name: "Rock Collection",
      can_write: true,
      is_remote_synced: true,
    },
    enterprisePlugins: ["remote_sync" as const],
    tokenFeatures: { remote_sync: true },
    isAdmin: true,
  };

  it("should show official icon for remote synced collection", () => {
    setup(syncedCollectionOptions);
    expect(getIcon("official_collection")).toBeInTheDocument();
  });

  it("should not show official icon for regular collection", () => {
    setup({
      ...syncedCollectionOptions,
      collection: {
        ...syncedCollectionOptions.collection,
        is_remote_synced: false,
      },
    });
    expect(queryIcon("official_collection")).not.toBeInTheDocument();
  });

  it("should not offer to designate official collections", async () => {
    setup(syncedCollectionOptions);
    await userEvent.click(getIcon("ellipsis"));
    await screen.findByRole("menu");
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Remove Official badge")).not.toBeInTheDocument();
  });
});

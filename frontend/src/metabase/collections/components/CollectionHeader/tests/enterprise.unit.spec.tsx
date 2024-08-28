import userEvent from "@testing-library/user-event";

import { getIcon, queryIcon, screen } from "__support__/ui";
import type { CollectionType } from "metabase-types/api";

import { setup } from "./setup";

describe("Instance Analytics Collection Header", () => {
  const defaultOptions = {
    collection: {
      name: "Metabase Analytics",
      type: "instance-analytics" as CollectionType,
      can_write: false,
    },
    hasEnterprisePlugins: true,
    // 😬 this test needs the official_collections feature flag so that it
    // doesn't cause the following test block to fail
    tokenFeatures: { audit_app: true, official_collections: true },
  };

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
      entity_id: "okNLSZKdSxaoG58JSQY54",
    },
    hasEnterprisePlugins: true,
    // 😬 this test needs the official_collections feature flag so that it
    // doesn't cause the following test block to fail
    tokenFeatures: { audit_app: true, official_collections: true },
    isAdmin: true,
  };

  it("should not show move button", async () => {
    setup(defaultOptions);
    await userEvent.click(getIcon("ellipsis"));
    await screen.findByRole("dialog");

    expect(getIcon("lock")).toBeInTheDocument();
    expect(queryIcon("move")).not.toBeInTheDocument();
    expect(screen.queryByText("Move")).not.toBeInTheDocument();
  });

  it("should not show archive button", async () => {
    setup(defaultOptions);
    await userEvent.click(getIcon("ellipsis"));
    await screen.findByRole("dialog");

    expect(getIcon("lock")).toBeInTheDocument();
    expect(queryIcon("archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });
});

describe("Official Collections Header", () => {
  const officialCollectionOptions = {
    collection: {
      id: 144,
      name: "Rock Collection",
      can_write: true,
    },
    hasEnterprisePlugins: true,
    tokenFeatures: { official_collections: true },
    isAdmin: true,
  };

  it("should allow admin users to designate official collections", async () => {
    setup(officialCollectionOptions);
    await userEvent.click(getIcon("ellipsis"));
    expect(
      await screen.findByText("Make collection official"),
    ).toBeInTheDocument();
    expect(await getIcon("badge")).toBeInTheDocument();
  });

  it("should not allow non-admin users to designate official collections", async () => {
    setup({
      ...officialCollectionOptions,
      isAdmin: false,
    });
    await userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
    expect(await queryIcon("badge")).not.toBeInTheDocument();
  });

  it("should not allow admin users to designate read-only collections as official", async () => {
    setup({
      ...officialCollectionOptions,
      collection: {
        ...officialCollectionOptions.collection,
        can_write: false,
      },
    });
    await userEvent.click(getIcon("ellipsis"));
    expect(
      screen.queryByText("Make collection official"),
    ).not.toBeInTheDocument();
    expect(await queryIcon("badge")).not.toBeInTheDocument();
  });
});

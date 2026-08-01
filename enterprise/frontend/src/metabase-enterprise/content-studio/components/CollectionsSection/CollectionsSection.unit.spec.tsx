import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type {
  Collection,
  RemoteSyncEntity,
  RemoteSyncType,
  RemoteSyncWorktree,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncWorktree,
} from "metabase-types/api/mocks";

import { setupContentStudio } from "../../tests/setup";

import { CollectionsSection } from "./CollectionsSection";

const SYNCED_COLLECTION = createMockCollection({
  id: 1,
  name: "Marketing",
  is_remote_synced: true,
  children: [createMockCollection({ id: 2, name: "Campaigns" })],
});

const UNSYNCED_COLLECTION = createMockCollection({
  id: 3,
  name: "Scratch space",
});

const PERSONAL_COLLECTION = createMockCollection({
  id: 4,
  name: "My personal collection",
  personal_owner_id: 1,
  is_personal: true,
  is_remote_synced: true,
});

const BRANCH_COLLECTION = createMockCollection({
  id: 10,
  name: "Checked out collection",
  worktree_id: 7,
});

const WORKTREE = createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" });

type SetupOpts = {
  initialRoute?: string;
  collections?: Collection[];
  branchCollections?: Collection[];
  worktrees?: RemoteSyncWorktree[];
  dirty?: RemoteSyncEntity[];
  remoteSyncType?: RemoteSyncType;
};

function setup({
  initialRoute = "/content-studio/collections",
  collections = [SYNCED_COLLECTION, UNSYNCED_COLLECTION, PERSONAL_COLLECTION],
  branchCollections = [BRANCH_COLLECTION],
  worktrees = [WORKTREE],
  dirty = [],
  remoteSyncType = "read-write",
}: SetupOpts = {}) {
  const onNewCollection = jest.fn();

  const { history } = setupContentStudio({
    routes: (
      <>
        <Route
          path="collections"
          element={<CollectionsSection onNewCollection={onNewCollection} />}
        />
        <Route
          path="collection/:slug"
          element={<CollectionsSection onNewCollection={onNewCollection} />}
        />
      </>
    ),
    initialRoute,
    settings: { "remote-sync-type": remoteSyncType },
    worktrees,
    dirty,
    collections,
    branchCollections,
  });

  return { history, onNewCollection };
}

function getTreeItem(name: string) {
  return screen.getByRole("link", { name }).closest("li");
}

describe("CollectionsSection", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows only the synced collections of the main branch", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: "Marketing" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Scratch space" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "My personal collection" }),
    ).not.toBeInTheDocument();
  });

  it("expands and collapses a collection", async () => {
    setup();

    await screen.findByRole("link", { name: "Marketing" });
    expect(
      screen.queryByRole("link", { name: "Campaigns" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(
      await screen.findByRole("link", { name: "Campaigns" }),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: "Campaigns" }),
      ).not.toBeInTheDocument();
    });
  });

  it("navigates to a collection's Content Studio page", async () => {
    const { history } = setup();

    await userEvent.click(
      await screen.findByRole("link", { name: "Marketing" }),
    );

    expect(history?.getCurrentLocation().pathname).toBe(
      "/content-studio/collection/1-marketing",
    );
  });

  it("highlights the selected collection and expands its ancestors", async () => {
    setup({ initialRoute: "/content-studio/collection/2-campaigns" });

    const selectedItem = await screen.findByRole("treeitem", {
      selected: true,
    });
    expect(within(selectedItem).getByText("Campaigns")).toBeVisible();
    expect(getTreeItem("Marketing")).toHaveAttribute("aria-selected", "false");
  });

  it("swaps the tree for the branch the studio is scoped to", async () => {
    setup({ initialRoute: "/content-studio/collections?worktree=7" });

    expect(
      await screen.findByRole("link", { name: "Checked out collection" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Marketing" }),
    ).not.toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/collection/tree");
    expect(call?.url).toContain("worktree-id=7");
  });

  it("badges a collection with unsynced changes", async () => {
    setup({
      dirty: [
        {
          id: 20,
          name: "Changed question",
          model: "card",
          sync_status: "update",
          collection_id: 1,
        },
      ],
    });

    await screen.findByRole("link", { name: "Marketing" });
    expect(await screen.findByTestId("remote-sync-status")).toBeInTheDocument();
  });

  it("points at the remote sync settings when nothing is synced", async () => {
    setup({ collections: [UNSYNCED_COLLECTION] });

    expect(
      await screen.findByText("No collections are synced yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Choose what to sync" }),
    ).toHaveAttribute("href", "/admin/settings/remote-sync");
  });

  it("asks the user to pull when the branch has no content", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=7",
      branchCollections: [],
    });

    expect(
      await screen.findByText("No content. Pull to load this branch."),
    ).toBeInTheDocument();
  });

  it("navigates to the collections root from the section header", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: "Collections" }),
    ).toHaveAttribute("href", "/content-studio/collections");
  });

  it("keeps the section header on the scoped branch", async () => {
    setup({ initialRoute: "/content-studio/collections?worktree=7" });

    expect(
      await screen.findByRole("link", { name: "Collections" }),
    ).toHaveAttribute("href", "/content-studio/collections?worktree=7");
  });

  it("leaves the section open when the header is followed with the keyboard", async () => {
    setup();

    await screen.findByRole("link", { name: "Marketing" });
    screen.getByRole("link", { name: "Collections" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByRole("link", { name: "Marketing" })).toBeVisible();
  });

  it("offers to create a collection", async () => {
    const { onNewCollection } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a new collection" }),
    );

    expect(onNewCollection).toHaveBeenCalled();
  });

  it("does not offer to create a collection on the main branch of a read-only instance", async () => {
    setup({ remoteSyncType: "read-only" });

    await screen.findByRole("link", { name: "Marketing" });
    expect(
      screen.queryByRole("button", { name: "Create a new collection" }),
    ).not.toBeInTheDocument();
  });

  it("offers to create a collection inside a branch of a read-only instance", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=7",
      remoteSyncType: "read-only",
    });

    expect(
      await screen.findByRole("button", { name: "Create a new collection" }),
    ).toBeInTheDocument();
  });
});

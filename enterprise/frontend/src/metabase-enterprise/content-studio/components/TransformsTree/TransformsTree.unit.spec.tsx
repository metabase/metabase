import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { Collection, EnterpriseSettings } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockRemoteSyncWorktree,
  createMockTransform,
} from "metabase-types/api/mocks";

import { setupContentStudio } from "../../tests/setup";

import { TransformsTree } from "./TransformsTree";

const MAIN_FOLDER = createMockCollection({
  id: 20,
  name: "Reporting",
  namespace: "transforms",
  children: [
    createMockCollection({ id: 21, name: "Weekly", namespace: "transforms" }),
  ],
});

const BRANCH_FOLDER = createMockCollection({
  id: 30,
  name: "Branch folder",
  namespace: "transforms",
  worktree_id: 7,
});

const WORKTREE = createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" });

type SetupOpts = {
  initialRoute?: string;
  transformCollections?: Collection[];
  branchTransformCollections?: Collection[];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

function setup({
  initialRoute = "/content-studio/transforms",
  transformCollections = [MAIN_FOLDER],
  branchTransformCollections = [BRANCH_FOLDER],
  remoteSyncType = "read-write",
}: SetupOpts = {}) {
  setupDatabaseListEndpoint([createMockDatabase({ id: 1 })]);

  fetchMock.get("path:/api/transform", [
    createMockTransform({ id: 1, name: "Active users", collection_id: null }),
  ]);
  fetchMock.post("path:/api/collection", createMockCollection({ id: 99 }));

  const { history } = setupContentStudio({
    routes: (
      <>
        <Route path="transforms" element={<TransformsTree />} />
        <Route path="collection/:slug" element={<TransformsTree />} />
      </>
    ),
    initialRoute,
    settings: {
      "remote-sync-type": remoteSyncType,
      "remote-sync-transforms": true,
    },
    worktrees: [WORKTREE],
    collections: transformCollections,
    branchCollections: branchTransformCollections,
    collectionById: createMockCollection({ id: 1 }),
  });

  return { history };
}

describe("TransformsTree", () => {
  afterEach(() => {
    reinitialize();
  });

  it("is a tree row of its own that opens the transforms root", async () => {
    setup({ initialRoute: "/content-studio/collection/20-reporting" });

    expect(
      await screen.findByRole("link", { name: "Transforms" }),
    ).toHaveAttribute("href", "/content-studio/transforms");
  });

  it("keeps the row on the branch the studio is scoped to", async () => {
    setup({ initialRoute: "/content-studio/transforms?worktree=7" });

    expect(
      await screen.findByRole("link", { name: "Transforms" }),
    ).toHaveAttribute("href", "/content-studio/transforms?worktree=7");
  });

  it("expands to the folders of the branch on screen", async () => {
    setup({ initialRoute: "/content-studio/collection/20-reporting" });

    await screen.findByRole("link", { name: "Transforms" });
    expect(
      await screen.findByRole("link", { name: "Reporting" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Active users" }),
    ).not.toBeInTheDocument();
  });

  it("lists only the folders of the branch the studio is scoped to", async () => {
    setup({ initialRoute: "/content-studio/transforms?worktree=7" });

    expect(
      await screen.findByRole("link", { name: "Branch folder" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Reporting" }),
    ).not.toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/transform");
    expect(call?.url).toContain("worktree-id=7");
  });

  it("marks the row as selected on the transforms root", async () => {
    setup();

    const selectedItem = await screen.findByRole("treeitem", {
      selected: true,
    });
    expect(selectedItem).toHaveTextContent("Transforms");
  });

  it("marks the folder being viewed as selected", async () => {
    setup({ initialRoute: "/content-studio/collection/20-reporting" });

    const selectedItem = await screen.findByRole("treeitem", {
      selected: true,
    });
    expect(selectedItem).toHaveTextContent("Reporting");
  });

  describe("keyboard", () => {
    it("reaches the row, its expand toggle and its menu independently", async () => {
      const { history } = setup({
        initialRoute: "/content-studio/collection/20-reporting",
      });

      const rows = await screen.findAllByRole("treeitem");
      const row = rows[0];

      // The expand toggle collapses the row and goes nowhere.
      const toggles = screen.getAllByRole("button", {
        name: /Collapse|Expand/,
      });
      toggles[0].focus();
      expect(toggles[0]).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      expect(
        screen.queryByRole("link", { name: "Reporting" }),
      ).not.toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        "/content-studio/collection/20-reporting",
      );

      // The kebab opens its menu and goes nowhere.
      const menuButton = screen.getByRole("button", {
        name: "Transforms options",
      });
      menuButton.focus();
      expect(menuButton).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      expect(
        await screen.findByRole("menuitem", { name: /New collection/ }),
      ).toBeInTheDocument();
      expect(history?.getCurrentLocation().pathname).toBe(
        "/content-studio/collection/20-reporting",
      );
      await userEvent.keyboard("{Escape}");

      // The row itself navigates.
      const link = screen.getByRole("link", { name: "Transforms" });
      expect(row).toContainElement(link);
      link.focus();
      expect(link).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await waitFor(() => {
        expect(history?.getCurrentLocation().pathname).toBe(
          "/content-studio/transforms",
        );
      });
    });
  });

  describe("new collection menu", () => {
    it("creates a collection in the transforms namespace", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("button", { name: "Transforms options" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /New collection/ }),
      );
      await userEvent.type(await screen.findByLabelText(/Name/), "Staging");
      expect(
        screen.queryByText("Collection it's saved in"),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called("path:/api/collection", {
            method: "POST",
          }),
        ).toBe(true);
      });
      const call = fetchMock.callHistory.lastCall("path:/api/collection", {
        method: "POST",
      });
      expect(await call?.request?.json()).toEqual({
        name: "Staging",
        parent_id: null,
        namespace: "transforms",
      });
    });

    it("creates the collection on the branch the studio is scoped to", async () => {
      setup({ initialRoute: "/content-studio/transforms?worktree=7" });

      await userEvent.click(
        await screen.findByRole("button", { name: "Transforms options" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /New collection/ }),
      );
      await userEvent.type(await screen.findByLabelText(/Name/), "Staging");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called("path:/api/collection", {
            method: "POST",
          }),
        ).toBe(true);
      });
      const call = fetchMock.callHistory.lastCall("path:/api/collection", {
        method: "POST",
      });
      expect(await call?.request?.json()).toEqual({
        name: "Staging",
        parent_id: null,
        namespace: "transforms",
        worktree_id: 7,
      });
    });

    it("cannot create a folder on a read-only main branch", async () => {
      setup({ remoteSyncType: "read-only" });

      await userEvent.click(
        await screen.findByRole("button", { name: "Transforms options" }),
      );

      expect(
        await screen.findByRole("menuitem", { name: /New collection/ }),
      ).toHaveAttribute("data-disabled", "true");
    });
  });
});

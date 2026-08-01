import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
  createMockRemoteSyncWorktree,
} from "metabase-types/api/mocks";

import { setupContentStudio } from "../../tests/setup";

import { SnippetsTree } from "./SnippetsTree";

const SNIPPET_ROOT = createMockCollection({ id: "root", name: "Root" });

const MAIN_FOLDER = createMockCollection({
  id: 20,
  name: "Reporting",
  namespace: "snippets",
  parent_id: null,
});

const NESTED_FOLDER = createMockCollection({
  id: 21,
  name: "Weekly",
  namespace: "snippets",
  parent_id: 20,
});

const BRANCH_FOLDER = createMockCollection({
  id: 30,
  name: "Branch folder",
  namespace: "snippets",
  parent_id: null,
  worktree_id: 7,
});

const WORKTREE = createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" });

type SetupOpts = {
  initialRoute?: string;
  snippetCollections?: Collection[];
  branchSnippetCollections?: Collection[];
};

function setup({
  initialRoute = "/content-studio/snippets",
  snippetCollections = [SNIPPET_ROOT, MAIN_FOLDER, NESTED_FOLDER],
  branchSnippetCollections = [SNIPPET_ROOT, BRANCH_FOLDER],
}: SetupOpts = {}) {
  fetchMock.get("path:/api/native-query-snippet", [
    createMockNativeQuerySnippet({
      id: 1,
      name: "Active users",
      collection_id: null,
    }),
  ]);
  fetchMock.get("path:/api/collection", (call) => {
    const worktreeId = new URL(call.url).searchParams.get("worktree-id");
    return worktreeId == null ? snippetCollections : branchSnippetCollections;
  });
  fetchMock.post("path:/api/collection", createMockCollection({ id: 99 }), {
    name: "create-collection",
  });

  setupContentStudio({
    routes: (
      <>
        <Route path="snippets" element={<SnippetsTree />} />
        <Route path="collection/:slug" element={<SnippetsTree />} />
      </>
    ),
    initialRoute,
    worktrees: [WORKTREE],
    collections: [],
    collectionById: createMockCollection({ id: 1 }),
  });
}

describe("SnippetsTree", () => {
  afterEach(() => {
    reinitialize();
  });

  it("is a tree row of its own that opens the snippets root", async () => {
    setup({ initialRoute: "/content-studio/collection/20-reporting" });

    expect(
      await screen.findByRole("link", { name: "SQL snippets" }),
    ).toHaveAttribute("href", "/content-studio/snippets");
  });

  it("keeps the row on the branch the studio is scoped to", async () => {
    setup({ initialRoute: "/content-studio/snippets?worktree=7" });

    expect(
      await screen.findByRole("link", { name: "SQL snippets" }),
    ).toHaveAttribute("href", "/content-studio/snippets?worktree=7");
  });

  it("expands to the folders of the branch on screen", async () => {
    setup();

    await screen.findByRole("link", { name: "SQL snippets" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Expand" }),
    );

    expect(
      await screen.findByRole("link", { name: "Reporting" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Active users" }),
    ).not.toBeInTheDocument();
  });

  it("lists only the folders of the branch the studio is scoped to", async () => {
    setup({ initialRoute: "/content-studio/snippets?worktree=7" });

    expect(
      await screen.findByRole("link", { name: "Branch folder" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Reporting" }),
    ).not.toBeInTheDocument();
  });

  it("marks the row as selected on the snippets root", async () => {
    setup();

    const selectedItem = await screen.findByRole("treeitem", {
      selected: true,
    });
    expect(selectedItem).toHaveTextContent("SQL snippets");
  });

  it("marks the folder being viewed as selected", async () => {
    setup({ initialRoute: "/content-studio/collection/20-reporting" });

    const selectedItem = await screen.findByRole("treeitem", {
      selected: true,
    });
    expect(selectedItem).toHaveTextContent("Reporting");
  });

  it("creates a collection in the snippets namespace", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "SQL snippets options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /New collection/ }),
    );
    await userEvent.type(await screen.findByLabelText(/Name/), "Shared");
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
      name: "Shared",
      parent_id: null,
      namespace: "snippets",
    });
  });
});

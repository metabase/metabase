import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupListTransformsEndpoint,
  setupNativeQuerySnippetEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import type { Collection, RemoteSyncWorktree } from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncWorktree,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../../scope";

import { ContentStudioSidebar } from "./ContentStudioSidebar";

const CREATED_WORKTREE = createMockRemoteSyncWorktree({
  id: 12,
  branch: "develop",
});

type SetupOpts = {
  initialRoute?: string;
  branches?: string[];
  worktrees?: RemoteSyncWorktree[];
  collections?: Collection[];
  branchCollections?: Collection[];
  isNavbarOpened?: boolean;
};

function setup({
  initialRoute = "/content-studio/collections",
  branches = ["main", "develop"],
  worktrees = [],
  collections = [],
  branchCollections = [],
  isNavbarOpened = true,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write",
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });

  setupRemoteSyncEndpoints({ branches, worktrees });
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupUserKeyValueEndpoints({
    namespace: "content_studio",
    key: "areCollectionsExpanded",
    value: true,
  });
  setupNativeQuerySnippetEndpoints();
  setupListTransformsEndpoint([]);
  setupDatabaseListEndpoint([]);
  fetchMock.get("path:/api/collection", []);
  fetchMock.get("path:/api/ee/library", { data: null });

  fetchMock.get("path:/api/collection/tree", (call) => {
    const params = new URL(call.url).searchParams;
    if (params.get("namespace") != null) {
      return [];
    }
    return params.get("worktree-id") == null ? collections : branchCollections;
  });
  // The new-collection form looks up a default parent even with its picker hidden.
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root" }),
  );
  fetchMock.get("express:/api/collection/:id", createMockCollection({ id: 1 }));

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings(settings),
  });

  setupEnterpriseOnlyPlugin("remote_sync");

  const { history, store } = renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
          </ContentStudioScopeProvider>
        }
      >
        <Route
          path="collections"
          element={<ContentStudioSidebar isNavbarOpened={isNavbarOpened} />}
        />
      </Route>
    </Route>,
    { initialRoute, withRouter: true, storeInitialState },
  );

  return { history, store };
}

/**
 * The list endpoint only reports the branch as checked out once it has been
 * created, so the scope survives the refetch that follows the creation.
 */
function mockWorktreeCreation(worktree = CREATED_WORKTREE) {
  let isCreated = false;

  fetchMock.removeRoute("remote-sync-worktree-list");
  fetchMock.get(
    "path:/api/ee/remote-sync/worktree",
    () => (isCreated ? [worktree] : []),
    { name: "remote-sync-worktree-list" },
  );
  fetchMock.removeRoute("remote-sync-worktree-create");
  fetchMock.post(
    "path:/api/ee/remote-sync/worktree",
    () => {
      isCreated = true;
      return worktree;
    },
    { name: "remote-sync-worktree-create" },
  );
}

async function openCheckOutModal() {
  await userEvent.click(
    await screen.findByRole("button", { name: /^Branch:/ }),
  );
  await userEvent.click(
    await screen.findByRole("option", { name: /Check out a branch/ }),
  );
  return screen.findByLabelText("Branch");
}

function getWorktreeCreateBody() {
  return fetchMock.callHistory
    .lastCall("path:/api/ee/remote-sync/worktree", { method: "POST" })
    ?.request?.json();
}

function getImportBody() {
  return fetchMock.callHistory
    .lastCall("path:/api/ee/remote-sync/import")
    ?.request?.json();
}

describe("ContentStudioSidebar", () => {
  afterEach(() => {
    reinitialize();
  });

  it("checks out an existing branch and scopes the studio to it", async () => {
    const { history } = setup();
    mockWorktreeCreation();

    await userEvent.type(await openCheckOutModal(), "develop");
    await userEvent.click(
      screen.getByRole("button", { name: "Check out branch" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/worktree", {
          method: "POST",
        }),
      ).toBe(true);
    });
    expect(await getWorktreeCreateBody()).toEqual({ branch: "develop" });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
      ).toBe(true);
    });
    expect(await getImportBody()).toEqual({
      branch: "develop",
      expected_branch: "develop",
      worktree_id: 12,
    });

    expect(history?.getCurrentLocation().search).toBe("?worktree=12");
    expect(
      await screen.findByRole("button", { name: "Branch: develop" }),
    ).toBeInTheDocument();
  });

  it("creates a branch that does not exist yet before checking it out", async () => {
    setup();
    mockWorktreeCreation(
      createMockRemoteSyncWorktree({ id: 12, branch: "brand-new" }),
    );

    await userEvent.type(await openCheckOutModal(), "brand-new");
    await userEvent.click(
      screen.getByRole("button", { name: "Create branch and check out" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/branch", {
          method: "POST",
        }),
      ).toBe(true);
    });
    const branchBody = await fetchMock.callHistory
      .lastCall("path:/api/ee/remote-sync/branch", { method: "POST" })
      ?.request?.json();
    expect(branchBody).toEqual({ name: "brand-new" });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/worktree", {
          method: "POST",
        }),
      ).toBe(true);
    });
    expect(await getWorktreeCreateBody()).toEqual({ branch: "brand-new" });

    // Creating a branch must not switch the instance over to it.
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/settings"),
    ).toBe(false);
  });

  it("does not offer branches that are already checked out", async () => {
    setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "develop" })],
    });

    await userEvent.click(await openCheckOutModal());

    expect(await screen.findByRole("option", { name: "main" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "develop" }),
    ).not.toBeInTheDocument();
  });

  it("shows a failed checkout as a form error", async () => {
    setup();
    fetchMock.removeRoute("remote-sync-worktree-create");
    fetchMock.post(
      "path:/api/ee/remote-sync/worktree",
      { status: 400, body: { message: "Branch is already checked out" } },
      { name: "remote-sync-worktree-create" },
    );

    await userEvent.type(await openCheckOutModal(), "develop");
    await userEvent.click(
      screen.getByRole("button", { name: "Check out branch" }),
    );

    expect(
      await screen.findByText("Branch is already checked out"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
    ).toBe(false);
  });

  it("toasts when the branch's content fails to load after checkout", async () => {
    const { store } = setup();
    mockWorktreeCreation();

    fetchMock.removeRoute("remote-sync-import");
    fetchMock.post(
      "path:/api/ee/remote-sync/import",
      { status: 500, body: { message: "boom" } },
      { name: "remote-sync-import" },
    );

    await userEvent.type(await openCheckOutModal(), "develop");
    await userEvent.click(
      screen.getByRole("button", { name: "Check out branch" }),
    );

    await waitFor(() => {
      const messages = store
        .getState()
        .undo.map((undo) => String(undo.message));
      expect(messages.some((message) => /boom/.test(message))).toBe(true);
    });
  });

  it("deletes a checkout after confirmation and returns to the main branch", async () => {
    const { history } = setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Branch options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete checkout/ }),
    );
    expect(
      screen.getByText(
        'Everything checked out from the "feature-a" branch will be deleted from this instance. The branch itself won\'t be touched.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete checkout" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "express:/api/ee/remote-sync/worktree/:id",
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      "express:/api/ee/remote-sync/worktree/:id",
    );
    expect(call?.url).toContain("/worktree/5");

    await waitFor(() => {
      expect(history?.getCurrentLocation().search).toBe("");
    });
  });

  it("swaps the collections tree when another branch is selected", async () => {
    const { history } = setup({
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
      collections: [
        createMockCollection({
          id: 1,
          name: "Marketing",
          is_remote_synced: true,
        }),
      ],
      branchCollections: [
        createMockCollection({ id: 10, name: "Checked out collection" }),
      ],
    });

    expect(
      await screen.findByRole("link", { name: "Marketing" }),
    ).toBeVisible();

    await userEvent.click(
      await screen.findByRole("button", { name: /^Branch:/ }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "feature-a" }),
    );

    expect(
      await screen.findByRole("link", { name: "Checked out collection" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Marketing" }),
    ).not.toBeInTheDocument();
    expect(history?.getCurrentLocation().search).toBe("?worktree=5");
  });

  it("creates a collection at the root of the selected branch", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Create a new collection" }),
    );
    await userEvent.type(await screen.findByLabelText(/Name/), "My folder");
    // The location picker is not offered: the collection goes to the branch root.
    expect(
      screen.queryByText("Collection it's saved in"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "express:/api/ee/remote-sync/worktree/:id/collection",
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      "express:/api/ee/remote-sync/worktree/:id/collection",
    );
    expect(call?.url).toContain("/worktree/5/collection");
    expect(await call?.request?.json()).toEqual({
      name: "My folder",
      description: null,
      authority_level: null,
    });
  });

  it("offers a new collection only from the Collections section", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Branch options" }),
    );

    expect(
      within(await screen.findByRole("menu")).queryByRole("menuitem", {
        name: /New collection/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new collection" }),
    ).toBeInTheDocument();
  });

  it("offers no branch actions on the main branch", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: "Branch: Main (main)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Branch options" }),
    ).not.toBeInTheDocument();
  });

  it("puts the namespace roots in the tree, each with its own menu", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: "Transforms" }),
    ).toHaveAttribute("href", "/content-studio/transforms");
    expect(screen.getByRole("link", { name: "SQL snippets" })).toHaveAttribute(
      "href",
      "/content-studio/snippets",
    );
    expect(
      screen.getByRole("button", { name: "Transforms options" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SQL snippets options" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("tree")
        .map((tree) => tree.getAttribute("aria-label")),
    ).toEqual(expect.arrayContaining(["Transforms", "SQL snippets"]));
  });

  it("shrinks the trees to their roots when the navbar is collapsed", async () => {
    setup({
      initialRoute: "/content-studio/collections?worktree=5",
      worktrees: [createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" })],
      isNavbarOpened: false,
    });

    expect(
      await screen.findByRole("link", { name: "Collections" }),
    ).toHaveAttribute("href", "/content-studio/collections?worktree=5");
    expect(screen.getByRole("link", { name: "Transforms" })).toHaveAttribute(
      "href",
      "/content-studio/transforms?worktree=5",
    );
    expect(screen.getByRole("link", { name: "SQL snippets" })).toHaveAttribute(
      "href",
      "/content-studio/snippets?worktree=5",
    );
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen } from "__support__/ui";
import type { ContentStudioSection } from "metabase/content-studio/app/pages/ContentStudioLayout";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { taskStarted } from "metabase-enterprise/remote_sync/sync-task-slice";
import type {
  Collection,
  EnterpriseSettings,
  NativeQuerySnippet,
  RemoteSyncWorktree,
  Transform,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockNativeQuerySnippet,
  createMockRemoteSyncWorktree,
  createMockSettings,
  createMockTokenFeatures,
  createMockTransform,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../scope";

import { ContentStudioRootPage } from "./ContentStudioRootPage";

const WORKTREE = createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" });

const SYNCED_COLLECTION = createMockCollection({
  id: 1,
  name: "Marketing",
  is_remote_synced: true,
});

const BRANCH_COLLECTION = createMockCollection({
  id: 10,
  name: "Checked out collection",
  worktree_id: WORKTREE.id,
});

const TRANSFORM_FOLDER = createMockCollection({
  id: 20,
  name: "Reporting",
  namespace: "transforms",
});

const MAIN_TRANSFORM = createMockTransform({
  id: 1,
  name: "Active users",
  collection_id: null,
});

const BRANCH_TRANSFORM = createMockTransform({
  id: 2,
  name: "Branch revenue",
  collection_id: null,
  worktree_id: WORKTREE.id,
});

const SNIPPET_ROOT = createMockCollection({ id: "root", name: "Snippets" });

const SNIPPET_FOLDER = createMockCollection({
  id: 30,
  name: "Reporting",
  namespace: "snippets",
  parent_id: null,
});

const MAIN_SNIPPET = createMockNativeQuerySnippet({
  id: 3,
  name: "Active users",
  collection_id: null,
});

type SetupOpts = {
  section: ContentStudioSection;
  initialRoute?: string;
  collections?: Collection[];
  branchCollections?: Collection[];
  worktrees?: RemoteSyncWorktree[];
  transforms?: Transform[];
  branchTransforms?: Transform[];
  snippets?: NativeQuerySnippet[];
  isLibrarySynced?: boolean;
  areTransformsSynced?: boolean;
  isRemoteSyncEnabled?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  hasTransformsError?: boolean;
};

function setup({
  section,
  initialRoute = `/content-studio/${section}`,
  collections = [SYNCED_COLLECTION],
  branchCollections = [BRANCH_COLLECTION],
  worktrees = [WORKTREE],
  transforms = [MAIN_TRANSFORM],
  branchTransforms = [BRANCH_TRANSFORM],
  snippets = [MAIN_SNIPPET],
  isLibrarySynced = true,
  areTransformsSynced = true,
  isRemoteSyncEnabled = true,
  remoteSyncType = "read-write",
  hasTransformsError = false,
}: SetupOpts) {
  const settings = createMockSettings({
    "remote-sync-enabled": isRemoteSyncEnabled,
    "remote-sync-branch": "main",
    "remote-sync-type": remoteSyncType,
    "remote-sync-transforms": areTransformsSynced,
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });

  setupRemoteSyncEndpoints({ worktrees });
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupUserMetabotPermissionsEndpoint();
  setupDatabaseListEndpoint([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);

  fetchMock.get("path:/api/collection/tree", (call) => {
    const params = new URL(call.url).searchParams;
    if (params.get("namespace") === "transforms") {
      return [TRANSFORM_FOLDER];
    }
    return params.get("worktree-id") == null ? collections : branchCollections;
  });
  fetchMock.get("path:/api/transform", (call) => {
    if (hasTransformsError) {
      return { status: 500, body: { message: "Could not load transforms" } };
    }
    const worktreeId = new URL(call.url).searchParams.get("worktree-id");
    return worktreeId == null ? transforms : branchTransforms;
  });
  fetchMock.get("path:/api/native-query-snippet", snippets);
  fetchMock.get("path:/api/collection", [SNIPPET_ROOT, SNIPPET_FOLDER]);
  fetchMock.get("path:/api/ee/library", {
    ...createMockCollection({ id: 5, name: "Library" }),
    model: "collection",
    is_remote_synced: isLibrarySynced,
  });
  fetchMock.post("path:/api/collection", createMockCollection({ id: 99 }));
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root", name: "Our analytics" }),
  );
  fetchMock.get("express:/api/collection/:id", SYNCED_COLLECTION);

  setupEnterpriseOnlyPlugin("remote_sync");

  const { store } = renderWithProviders(
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
          path={section}
          element={<ContentStudioRootPage section={section} />}
        />
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settings),
      }),
    },
  );

  return { store };
}

describe("ContentStudioRootPage", () => {
  afterEach(() => {
    reinitialize();
  });

  describe("shared chrome", () => {
    it.each<[ContentStudioSection, string]>([
      ["collections", "Collections"],
      ["transforms", "Transforms"],
      ["snippets", "SQL snippets"],
    ])("titles the %s root and lists its contents", async (section, title) => {
      setup({ section });

      expect(
        await screen.findByRole("heading", { name: title, level: 2 }),
      ).toBeInTheDocument();
      expect(
        await screen.findByTestId("content-studio-folder-contents"),
      ).toBeInTheDocument();
    });

    it.each<ContentStudioSection>(["collections", "transforms", "snippets"])(
      "shows the setup state on the %s root when remote sync is not configured",
      async (section) => {
        setup({ section, isRemoteSyncEnabled: false });

        expect(
          await screen.findByRole("heading", {
            name: "Connect a repository to get started",
          }),
        ).toBeInTheDocument();
      },
    );

    it.each<ContentStudioSection>(["collections", "transforms", "snippets"])(
      "shows import progress on the %s root while the branch is pulled in",
      async (section) => {
        const { store } = setup({
          section,
          initialRoute: `/content-studio/${section}?worktree=5`,
        });

        await screen.findByRole("heading", { level: 2 });

        act(() => {
          store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
        });

        expect(
          await screen.findByText("Loading this branch's content…"),
        ).toBeInTheDocument();
      },
    );
  });

  describe("collections root", () => {
    it("lists the synced top-level collections of the main branch", async () => {
      setup({ section: "collections" });

      expect(
        await screen.findByRole("link", { name: "Marketing" }),
      ).toHaveAttribute("href", "/content-studio/collection/1-marketing");
    });

    it("lists the top-level collections of the branch the studio is scoped to", async () => {
      setup({
        section: "collections",
        initialRoute: "/content-studio/collections?worktree=5",
      });

      expect(
        await screen.findByRole("link", { name: "Checked out collection" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("link", { name: "Marketing" }),
      ).not.toBeInTheDocument();
    });

    it("points at the remote sync settings when nothing is synced", async () => {
      setup({ section: "collections", collections: [] });

      expect(
        await screen.findByText("No collections are synced yet."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Choose what to sync" }),
      ).toHaveAttribute("href", "/admin/settings/remote-sync");
    });

    it("explains the sections when nothing is synced and no branch is checked out", async () => {
      setup({ section: "collections", collections: [], worktrees: [] });

      expect(
        await screen.findByTestId("content-studio-onboarding"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Choose collections to sync" }),
      ).toHaveAttribute("href", "/admin/settings/remote-sync");

      await userEvent.click(
        screen.getByRole("button", { name: "Check out a branch" }),
      );

      expect(
        await screen.findByRole("dialog", { name: "Check out a branch" }),
      ).toBeInTheDocument();
    });

    it("keeps showing content while the selected branch is being pushed", async () => {
      const { store } = setup({
        section: "collections",
        initialRoute: "/content-studio/collections?worktree=5",
      });

      act(() => {
        store.dispatch(taskStarted({ taskType: "export", worktreeId: 5 }));
      });

      expect(
        await screen.findByRole("heading", { name: "Collections" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("branch-sync-progress"),
      ).not.toBeInTheDocument();
    });

    it("keeps showing content while another branch syncs", async () => {
      const { store } = setup({ section: "collections" });

      act(() => {
        store.dispatch(taskStarted({ taskType: "import", worktreeId: 5 }));
      });

      expect(
        await screen.findByRole("heading", { name: "Collections" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("branch-sync-progress"),
      ).not.toBeInTheDocument();
    });

    it("offers creating a collection", async () => {
      setup({ section: "collections" });

      await userEvent.click(
        await screen.findByRole("button", { name: /New collection/ }),
      );

      expect(
        await screen.findByTestId("new-collection-modal"),
      ).toBeInTheDocument();
    });

    it("does not offer creating a collection on a read-only main branch", async () => {
      setup({ section: "collections", remoteSyncType: "read-only" });

      await screen.findByRole("link", { name: "Marketing" });
      expect(
        screen.queryByRole("button", { name: /New collection/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("transforms root", () => {
    it("links folders and transforms to their Content Studio pages", async () => {
      setup({ section: "transforms" });

      expect(
        await screen.findByRole("link", { name: "Reporting" }),
      ).toHaveAttribute("href", "/content-studio/collection/20-reporting");
      expect(
        screen.getByRole("link", { name: "Active users" }),
      ).toHaveAttribute("href", "/content-studio/transforms/1");
    });

    it("lists the transforms of the branch the studio is scoped to", async () => {
      setup({
        section: "transforms",
        initialRoute: "/content-studio/transforms?worktree=5",
      });

      expect(await screen.findByText("Branch revenue")).toBeInTheDocument();
      expect(screen.queryByText("Active users")).not.toBeInTheDocument();
    });

    it("reports a failure to load the transforms", async () => {
      setup({ section: "transforms", hasTransformsError: true });

      expect(
        await screen.findByText("Could not load transforms"),
      ).toBeInTheDocument();
    });

    it("points at the sync settings when transforms are not synced", async () => {
      setup({ section: "transforms", areTransformsSynced: false });

      expect(
        await screen.findByText(
          "Transforms aren't part of remote sync yet. Turn on transform sync to manage them from here.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Choose what to sync" }),
      ).toHaveAttribute("href", "/admin/settings/remote-sync");
    });

    it("keeps managing a branch's transforms when transform sync is off", async () => {
      setup({
        section: "transforms",
        initialRoute: "/content-studio/transforms?worktree=5",
        areTransformsSynced: false,
      });

      expect(await screen.findByText("Branch revenue")).toBeInTheDocument();
    });

    it("offers creating a transform", async () => {
      setup({ section: "transforms" });

      await userEvent.click(
        await screen.findByRole("button", { name: "Create a transform" }),
      );

      expect(await screen.findByText("Query builder")).toBeInTheDocument();
    });
  });

  describe("snippets root", () => {
    it("links folders and snippets to their Content Studio pages", async () => {
      setup({ section: "snippets" });

      expect(
        await screen.findByRole("link", { name: "Reporting" }),
      ).toHaveAttribute("href", "/content-studio/collection/30-reporting");
      expect(
        screen.getByRole("link", { name: "Active users" }),
      ).toHaveAttribute("href", "/content-studio/snippets/3");
    });

    it("explains that snippets follow the Library when it is not synced", async () => {
      setup({ section: "snippets", isLibrarySynced: false });

      expect(
        await screen.findByText(
          "Snippets are synced along with the Library. Turn on Library sync to manage them from here.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "New snippet" }),
      ).not.toBeInTheDocument();
    });

    it("offers the branch's create and archive routes", async () => {
      setup({
        section: "snippets",
        initialRoute: "/content-studio/snippets?worktree=5",
      });

      expect(
        await screen.findByRole("link", { name: "New snippet" }),
      ).toHaveAttribute("href", "/content-studio/snippets/new?worktree=5");
      expect(
        screen.getByRole("link", { name: "Archived snippets" }),
      ).toHaveAttribute("href", "/content-studio/snippets/archived?worktree=5");
    });

    it("does not offer creating a snippet on a read-only main branch", async () => {
      setup({ section: "snippets", remoteSyncType: "read-only" });

      await screen.findByRole("link", { name: "Reporting" });
      expect(
        screen.queryByRole("link", { name: "New snippet" }),
      ).not.toBeInTheDocument();
    });
  });
});

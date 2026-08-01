import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupCollectionByIdEndpoint,
  setupNativeQuerySnippetEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { NewSnippetPage } from "metabase-enterprise/data-studio/library/snippets/pages/NewSnippetPage";
import type {
  Collection,
  EnterpriseSettings,
  NativeQuerySnippet,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockNativeQuerySnippet,
  createMockRemoteSyncWorktree,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../scope";

import { ContentStudioEditSnippetPage } from "./ContentStudioEditSnippetPage";
import { ContentStudioRootPage } from "./ContentStudioRootPage";
import { ContentStudioSnippetsLayout } from "./ContentStudioSnippetsLayout";

const WORKTREE = createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" });
const CREATED_SNIPPET_ID = 99;

type SetupOpts = {
  initialRoute?: string;
  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  plugins?: ENTERPRISE_PLUGIN_NAME[];
};

function setup({
  initialRoute = "/content-studio/snippets/new",
  snippets = [],
  snippetCollections = [],
  remoteSyncType = "read-write",
  plugins = ["remote_sync"],
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": remoteSyncType,
    "token-features": createMockTokenFeatures({
      remote_sync: true,
      snippet_collections: true,
    }),
  });

  setupRemoteSyncEndpoints({ worktrees: [WORKTREE] });
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupNativeQuerySnippetEndpoints({ snippets });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  fetchMock.get("path:/api/collection", snippetCollections);
  fetchMock.get("path:/api/ee/library", {
    ...createMockCollection({ id: 5, name: "Library" }),
    model: "collection",
    is_remote_synced: true,
  });
  const createdSnippet = createMockNativeQuerySnippet({
    id: CREATED_SNIPPET_ID,
    worktree_id: WORKTREE.id,
  });
  fetchMock.post("path:/api/native-query-snippet", createdSnippet, {
    name: "create-snippet",
  });
  fetchMock.get(
    `path:/api/native-query-snippet/${CREATED_SNIPPET_ID}`,
    createdSnippet,
  );

  plugins.forEach(setupEnterpriseOnlyPlugin);

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
        <Route path="snippets" element={<ContentStudioSnippetsLayout />}>
          <Route index element={<ContentStudioRootPage section="snippets" />} />
          <Route path="new" element={<NewSnippetPage />} />
          <Route path=":snippetId" element={<ContentStudioEditSnippetPage />} />
        </Route>
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

  return { history, store };
}

function getCreateRequestBody() {
  return fetchMock.callHistory
    .lastCall("path:/api/native-query-snippet", { method: "POST" })
    ?.request?.json();
}

async function fillInSnippet() {
  await userEvent.clear(screen.getByPlaceholderText("New SQL snippet"));
  await userEvent.type(
    screen.getByPlaceholderText("New SQL snippet"),
    "Revenue",
  );
  await userEvent.type(screen.getByTestId("snippet-editor"), "select 1");
}

describe("Content Studio snippet pages", () => {
  afterEach(() => {
    reinitialize();
  });

  describe("new snippet", () => {
    it("keeps the breadcrumb inside Content Studio", async () => {
      setup({ initialRoute: "/content-studio/snippets/new?worktree=7" });

      expect(
        await screen.findByRole("link", { name: "SQL snippets" }),
      ).toHaveAttribute("href", "/content-studio/snippets?worktree=7");
    });

    it("creates the snippet into the selected branch without a folder picker", async () => {
      setup({ initialRoute: "/content-studio/snippets/new?worktree=7" });

      await screen.findByTestId("new-snippet-page");
      await fillInSnippet();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called("path:/api/native-query-snippet", {
            method: "POST",
          }),
        ).toBe(true);
      });
      expect(await getCreateRequestBody()).toMatchObject({
        name: "Revenue",
        collection_id: null,
        worktree_id: 7,
      });
      expect(
        screen.queryByRole("dialog", { name: /folder/i }),
      ).not.toBeInTheDocument();
    });

    it("surfaces a name collision inside the branch", async () => {
      const { store } = setup({
        initialRoute: "/content-studio/snippets/new?worktree=7",
      });
      fetchMock.removeRoute("create-snippet");
      fetchMock.post(
        "path:/api/native-query-snippet",
        {
          status: 400,
          body: { message: "A snippet with that name already exists" },
        },
        { name: "create-snippet" },
      );

      await screen.findByTestId("new-snippet-page");
      await fillInSnippet();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        const messages = store
          .getState()
          .undo.map((undo) => String(undo.message));
        expect(messages).toContain("A snippet with that name already exists");
      });
    });

    it("stays editable in a branch on a read-only instance", async () => {
      setup({
        initialRoute: "/content-studio/snippets/new?worktree=7",
        remoteSyncType: "read-only",
      });

      expect(await screen.findByTestId("new-snippet-page")).toBeInTheDocument();
    });

    it("is not available on a read-only main branch", async () => {
      setup({ remoteSyncType: "read-only" });

      expect(
        await screen.findByText(
          "Sorry, you don’t have permission to see that.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("edit snippet", () => {
    const BRANCH_SNIPPET = createMockNativeQuerySnippet({
      id: 42,
      name: "Branch revenue",
      collection_id: null,
      worktree_id: 7,
    });

    it("keeps the breadcrumb inside Content Studio", async () => {
      setup({
        initialRoute: "/content-studio/snippets/42",
        snippets: [BRANCH_SNIPPET],
      });

      expect(
        await screen.findByRole("link", { name: "SQL snippets" }),
      ).toHaveAttribute("href", "/content-studio/snippets?worktree=7");
    });

    it("stays editable for a branch snippet on a read-only instance", async () => {
      setup({
        initialRoute: "/content-studio/snippets/42",
        snippets: [BRANCH_SNIPPET],
        remoteSyncType: "read-only",
      });

      await screen.findByTestId("edit-snippet-page");
      expect(screen.getByTestId("snippet-editor")).toBeEnabled();
      expect(
        within(screen.getByTestId("snippet-header")).getByRole("textbox"),
      ).toBeEnabled();
    });

    it("locks a main-branch snippet on a read-only instance", async () => {
      setup({
        initialRoute: "/content-studio/snippets/42",
        snippets: [createMockNativeQuerySnippet({ id: 42, name: "Revenue" })],
        remoteSyncType: "read-only",
      });

      await screen.findByTestId("edit-snippet-page");
      expect(screen.getByTestId("snippet-editor")).toBeDisabled();
    });
  });

  describe("landing page", () => {
    it("lists the branch's root folders and snippets and nothing deeper", async () => {
      setup({
        initialRoute: "/content-studio/snippets?worktree=7",
        snippetCollections: [
          createMockCollection({
            id: "root",
            name: "Snippets",
            namespace: "snippets",
          }),
          createMockCollection({
            id: 20,
            name: "Reporting",
            namespace: "snippets",
            parent_id: null,
          }),
        ],
        snippets: [
          createMockNativeQuerySnippet({
            id: 1,
            name: "Active users",
            collection_id: null,
          }),
          createMockNativeQuerySnippet({
            id: 3,
            name: "Weekly cohort",
            collection_id: 20,
          }),
        ],
      });

      expect(
        await screen.findByRole("link", { name: "Reporting" }),
      ).toHaveAttribute("href", "/content-studio/collection/20-reporting");
      expect(
        screen.getByRole("link", { name: "Active users" }),
      ).toHaveAttribute("href", "/content-studio/snippets/1");
      expect(
        screen.queryByRole("link", { name: "Weekly cohort" }),
      ).not.toBeInTheDocument();
    });

    it("offers the branch's create and archive routes", async () => {
      setup({ initialRoute: "/content-studio/snippets?worktree=7" });

      expect(
        await screen.findByRole("link", { name: "New snippet" }),
      ).toHaveAttribute("href", "/content-studio/snippets/new?worktree=7");
      expect(
        screen.getByRole("link", { name: "Archived snippets" }),
      ).toHaveAttribute("href", "/content-studio/snippets/archived?worktree=7");
    });
  });
});

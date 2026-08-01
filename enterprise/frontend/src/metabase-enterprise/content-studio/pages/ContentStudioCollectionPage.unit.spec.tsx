import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type {
  Collection,
  CollectionItem,
  RemoteSyncType,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockNativeQuerySnippet,
  createMockRemoteSyncWorktree,
  createMockTransform,
} from "metabase-types/api/mocks";

import { useContentStudioScope } from "../scope";
import { setupContentStudio } from "../tests/setup";

import { ContentStudioCollectionPage } from "./ContentStudioCollectionPage";

const WORKTREE = createMockRemoteSyncWorktree({ id: 5, branch: "feature-a" });

const MAIN_COLLECTION = createMockCollection({
  id: 10,
  name: "Analytics",
  can_write: true,
  is_remote_synced: true,
});

const BRANCH_COLLECTION = createMockCollection({
  id: 11,
  name: "Analytics",
  can_write: true,
  is_remote_synced: true,
  worktree_id: WORKTREE.id,
});

// `can_write` is where the backend reports remote sync editability: it is false
// for a synced collection on a read-only instance, and true for a worktree
// collection whatever the instance's sync mode.
const READ_ONLY_COLLECTION = createMockCollection({
  id: 15,
  name: "Analytics",
  can_write: false,
  is_remote_synced: true,
});

const SUB_COLLECTION_ITEM = createMockCollectionItem({
  id: 12,
  model: "collection",
  name: "Reports",
});

const QUESTION_ITEM = createMockCollectionItem({
  id: 13,
  model: "card",
  name: "Revenue",
});

const PINNED_DASHBOARD_ITEM = createMockCollectionItem({
  id: 14,
  model: "dashboard",
  name: "Overview",
  collection_position: 1,
});

function ScopeProbe() {
  const { worktreeId } = useContentStudioScope();
  return <div data-testid="current-scope">{worktreeId ?? "main"}</div>;
}

type SetupOpts = {
  collection?: Collection;
  items?: CollectionItem[];
  remoteSyncType?: RemoteSyncType;
};

function setup({
  collection = MAIN_COLLECTION,
  items = [SUB_COLLECTION_ITEM, QUESTION_ITEM, PINNED_DASHBOARD_ITEM],
  remoteSyncType = "read-write",
}: SetupOpts = {}) {
  setupBookmarksEndpoints([]);
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionByIdEndpoint({ collections: [collection] });

  fetchMock.get(`path:/api/collection/${collection.id}/items`, (call) => {
    const url = new URL(call.url);
    const isPinnedQuery = url.searchParams.get("pinned_state") === "is_pinned";
    const data = items.filter(
      (item) => (item.collection_position != null) === isPinnedQuery,
    );

    return { data, total: data.length, models: [], limit: null, offset: null };
  });

  fetchMock.put(`path:/api/collection/${collection.id}`, collection);

  setupContentStudio({
    routes: (
      <Route
        path="collection/:slug"
        element={<ContentStudioCollectionPage />}
      />
    ),
    chrome: <ScopeProbe />,
    initialRoute: `/content-studio/collection/${collection.id}`,
    withDND: true,
    worktrees: [WORKTREE],
    settings: { "remote-sync-type": remoteSyncType },
  });
}

describe("ContentStudioCollectionPage", () => {
  afterEach(() => {
    reinitialize();
  });

  it("renders the header, pinned items and the items table", async () => {
    setup();

    expect(await screen.findByDisplayValue("Analytics")).toBeInTheDocument();
    expect(
      await within(await screen.findByTestId("pinned-items")).findByText(
        "Overview",
      ),
    ).toBeInTheDocument();

    const table = await screen.findByTestId("collection-table");
    expect(within(table).getByText("Reports")).toBeInTheDocument();
    expect(within(table).getByText("Revenue")).toBeInTheDocument();
  });

  it("offers a menu for creating content in the collection", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));

    expect(
      await screen.findByRole("menuitem", { name: /Dashboard/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Collection/ }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when the collection has no items", async () => {
    setup({ items: [] });

    expect(
      await screen.findByText("This collection is empty"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("collection-table")).not.toBeInTheDocument();
  });

  describe("navigation", () => {
    it("keeps sub-collections and questions inside Content Studio and sends other items to the main app", async () => {
      setup();

      const table = await screen.findByTestId("collection-table");

      expect(
        within(table).getByRole("link", { name: /Reports/ }),
      ).toHaveAttribute("href", "/content-studio/collection/12-reports");
      expect(
        within(table).getByRole("link", { name: /Revenue/ }),
      ).toHaveAttribute("href", "/content-studio/question/13-revenue");
      expect(
        within(await screen.findByTestId("pinned-items")).getByRole("link", {
          name: /Overview/,
        }),
      ).toHaveAttribute("href", "/dashboard/14-overview");
    });
  });

  describe("scope sync", () => {
    it("scopes the studio to the branch the collection lives on", async () => {
      setup({ collection: BRANCH_COLLECTION });

      expect(await screen.findByDisplayValue("Analytics")).toBeInTheDocument();
      expect(await screen.findByTestId("current-scope")).toHaveTextContent("5");
    });

    it("scopes the studio to the main branch for a collection outside a branch", async () => {
      setup();

      expect(await screen.findByDisplayValue("Analytics")).toBeInTheDocument();
      expect(await screen.findByTestId("current-scope")).toHaveTextContent(
        "main",
      );
    });
  });

  describe("read-only instances", () => {
    it("disables editing and bulk selection for a collection the user cannot write", async () => {
      setup({ collection: READ_ONLY_COLLECTION, remoteSyncType: "read-only" });

      expect(await screen.findByDisplayValue("Analytics")).toBeDisabled();
      await screen.findByTestId("collection-table");
      expect(
        screen.queryByLabelText("Select all items"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /New/ }),
      ).not.toBeInTheDocument();
    });

    it("keeps a branch collection editable", async () => {
      setup({ collection: BRANCH_COLLECTION, remoteSyncType: "read-only" });

      expect(await screen.findByDisplayValue("Analytics")).toBeEnabled();
      expect(
        await screen.findByLabelText("Select all items"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /New/ })).toBeInTheDocument();
    });

    it("allows editing and bulk selection on a read-write instance", async () => {
      setup();

      expect(await screen.findByDisplayValue("Analytics")).toBeEnabled();
      expect(
        await screen.findByLabelText("Select all items"),
      ).toBeInTheDocument();
    });
  });

  it("renames the collection from the header", async () => {
    setup();

    const title = await screen.findByDisplayValue("Analytics");
    await userEvent.clear(title);
    await userEvent.type(title, "Reporting");
    await userEvent.tab();

    const calls = fetchMock.callHistory.calls(
      `path:/api/collection/${MAIN_COLLECTION.id}`,
      { method: "PUT" },
    );
    expect(calls).toHaveLength(1);
    expect(await calls[0].request?.json()).toEqual(
      expect.objectContaining({ name: "Reporting" }),
    );
  });
});

const TRANSFORM_FOLDER = createMockCollection({
  id: 20,
  name: "Reporting",
  namespace: "transforms",
  can_write: true,
});

const SNIPPET_FOLDER = createMockCollection({
  id: 20,
  name: "Reporting",
  namespace: "snippets",
  parent_id: null,
  can_write: true,
});

const SUB_FOLDER = createMockCollection({
  id: 21,
  name: "Weekly",
  parent_id: 20,
});

function setupFolder(collection: Collection) {
  setupBookmarksEndpoints([]);
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupDatabaseListEndpoint([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);

  fetchMock.get("path:/api/collection", [
    createMockCollection({ id: "root", name: "Snippets" }),
    SNIPPET_FOLDER,
    SUB_FOLDER,
  ]);
  fetchMock.get("path:/api/transform", [
    createMockTransform({ id: 1, name: "Active users", collection_id: null }),
    createMockTransform({ id: 3, name: "Weekly cohort", collection_id: 20 }),
  ]);
  fetchMock.get("path:/api/native-query-snippet", [
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
  ]);

  setupContentStudio({
    routes: (
      <Route
        path="collection/:slug"
        element={<ContentStudioCollectionPage />}
      />
    ),
    initialRoute: `/content-studio/collection/${collection.id}`,
    withDND: true,
    worktrees: [WORKTREE],
    collections: [
      { ...TRANSFORM_FOLDER, children: [{ ...SUB_FOLDER, children: [] }] },
    ],
  });
}

describe("ContentStudioCollectionPage namespaces", () => {
  afterEach(() => {
    reinitialize();
  });

  it("lists a transform folder's sub-folders and transforms and nothing else", async () => {
    setupFolder(TRANSFORM_FOLDER);

    expect(await screen.findByDisplayValue("Reporting")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Weekly" })).toHaveAttribute(
      "href",
      "/content-studio/collection/21-weekly",
    );
    expect(screen.getByRole("link", { name: "Weekly cohort" })).toHaveAttribute(
      "href",
      "/content-studio/transforms/3",
    );
    expect(
      screen.queryByRole("link", { name: "Active users" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("collection-table")).not.toBeInTheDocument();
  });

  it("does not offer creating a transform from a folder, which the folder cannot hold", async () => {
    setupFolder(TRANSFORM_FOLDER);

    expect(await screen.findByDisplayValue("Reporting")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create a transform" }),
    ).not.toBeInTheDocument();
  });

  it("lists a snippet folder's sub-folders and snippets and nothing else", async () => {
    setupFolder(SNIPPET_FOLDER);

    expect(await screen.findByDisplayValue("Reporting")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Weekly" })).toHaveAttribute(
      "href",
      "/content-studio/collection/21-weekly",
    );
    expect(screen.getByRole("link", { name: "Weekly cohort" })).toHaveAttribute(
      "href",
      "/content-studio/snippets/3",
    );
    expect(
      screen.queryByRole("link", { name: "Active users" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("collection-table")).not.toBeInTheDocument();
  });

  it("does not offer creating a snippet from a folder, which the folder cannot hold", async () => {
    setupFolder(SNIPPET_FOLDER);

    expect(await screen.findByDisplayValue("Reporting")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New snippet" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Archived snippets" }),
    ).not.toBeInTheDocument();
  });
});

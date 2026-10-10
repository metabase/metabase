import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionItemsEndpoint,
  setupCollectionTreeEndpoint,
  setupDashboardEndpoints,
  setupSearchEndpoints,
  setupUnauthorizedCollectionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { CollectionItem, SearchResult } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DashboardsPage } from "./DashboardsPage";

const SALES_FOLDER = createMockCollectionItem({
  id: 3,
  model: "collection",
  name: "Sales",
  here: ["dashboard"],
});

const REVENUE_DASHBOARD = createMockCollectionItem({
  id: 20,
  model: "dashboard",
  name: "Revenue overview",
  can_write: true,
});

const DASHBOARDS_COLLECTION_ID = 2;

type SetupOpts = {
  hasLibrary?: boolean;
  canRead?: boolean;
  canWrite?: boolean;
  isRemoteSyncReadOnly?: boolean;
  items?: CollectionItem[];
  searchResults?: SearchResult[];
  hasItemsError?: boolean;
};

function setup({
  hasLibrary = true,
  canRead = true,
  canWrite = true,
  isRemoteSyncReadOnly = false,
  items = [SALES_FOLDER, REVENUE_DASHBOARD],
  searchResults = [],
  hasItemsError = false,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 800 });
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      library: true,
      remote_sync: isRemoteSyncReadOnly,
    }),
    "remote-sync-enabled": isRemoteSyncReadOnly,
    "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : undefined,
  });
  setupEnterpriseOnlyPlugin("library");
  setupEnterpriseOnlyPlugin("remote_sync");

  const dashboardsCollection = createMockCollection({
    id: DASHBOARDS_COLLECTION_ID,
    name: "Dashboards",
    type: "library-dashboards",
    can_write: canWrite,
  });
  const libraryCollection = createMockCollection({
    id: 1,
    name: "Library",
    type: "library",
    children: canRead ? [dashboardsCollection] : [],
  });
  setupCollectionTreeEndpoint(hasLibrary ? [libraryCollection] : []);
  if (hasItemsError) {
    setupUnauthorizedCollectionEndpoints(dashboardsCollection);
  } else {
    setupCollectionItemsEndpoint({
      collection: dashboardsCollection,
      collectionItems: items,
    });
  }
  setupSearchEndpoints(searchResults);
  setupDashboardEndpoints(
    createMockDashboard({ id: REVENUE_DASHBOARD.id, name: "Revenue overview" }),
  );

  return renderWithProviders(
    <Route path="/data-studio/dashboards" element={<DashboardsPage />} />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: "/data-studio/dashboards",
      storeInitialState: createMockState({ settings }),
    },
  );
}

describe("DashboardsPage", () => {
  it("lists folders and dashboards at the top level, linking each dashboard to its Data Studio page", async () => {
    setup();

    expect(await screen.findByText("Sales")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("collection-name").map((row) => row.textContent),
    ).toEqual(["Sales"]);
    expect(
      screen.getByRole("link", { name: /Revenue overview/ }),
    ).toHaveAttribute("href", "/data-studio/dashboards/20");
  });

  it("offers New when the user can write the Dashboards collection", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    expect(
      await screen.findByRole("menuitem", { name: /Dashboard/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Folder/ }),
    ).toBeInTheDocument();
  });

  it("opens the New collection modal in the Dashboards collection from Folder", async () => {
    const { store } = setup();

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Folder/ }),
    );

    expect(store.getState().modal).toMatchObject({
      id: "collection",
      props: {
        initialCollectionId: DASHBOARDS_COLLECTION_ID,
        namespaces: [null],
        pickerOptions: { hasLibrary: true, hasRootCollection: false },
      },
    });
  });

  it.each([
    { name: "the user cannot write", canWrite: false },
    { name: "remote sync is read-only", isRemoteSyncReadOnly: true },
  ])("hides New when $name", async ({ canWrite, isRemoteSyncReadOnly }) => {
    setup({ canWrite, isRemoteSyncReadOnly });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("says when there are no dashboards yet", async () => {
    setup({ items: [] });

    expect(await screen.findByText("No dashboards yet")).toBeInTheDocument();
  });

  it("searches dashboards and reports when nothing matches", async () => {
    setup({
      searchResults: [
        createMockSearchResult({
          id: 20,
          model: "dashboard",
          name: "Revenue overview",
        }),
      ],
    });
    const searchInput = await screen.findByPlaceholderText("Search...");

    await userEvent.type(searchInput, "revenue");
    await waitFor(() =>
      expect(screen.queryByText("Sales")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("link", { name: /Revenue overview/ }),
    ).toHaveAttribute("href", "/data-studio/dashboards/20");

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "churn");
    expect(
      await screen.findByText('No results for "churn"'),
    ).toBeInTheDocument();
  });

  it("reports an error when the dashboards cannot be fetched", async () => {
    setup({ hasItemsError: true });

    expect(
      await screen.findByText(/Data couldn't be fetched properly/, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
  });

  it("moves a selected dashboard to the trash and refreshes the list", async () => {
    setup();
    const dashboardRow = await screen.findByRole("row", {
      name: /Revenue overview/,
    });

    await userEvent.click(
      within(dashboardRow).getByRole("checkbox", { name: "Select row" }),
    );
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    fetchMock.removeRoutes({
      names: [
        `collection-${DASHBOARDS_COLLECTION_ID}-items`,
        `collection-${DASHBOARDS_COLLECTION_ID}-items-metadata`,
      ],
    });
    setupCollectionItemsEndpoint({
      collection: { id: DASHBOARDS_COLLECTION_ID },
      collectionItems: [SALES_FOLDER],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Move to trash",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Revenue overview")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.queryByText("1 item selected")).not.toBeInTheDocument();
    const archiveCalls = fetchMock.callHistory.calls(
      `path:/api/dashboard/${REVENUE_DASHBOARD.id}`,
      { method: "PUT" },
    );
    expect(archiveCalls).toHaveLength(1);
    const archiveBody: unknown = JSON.parse(
      String(archiveCalls[0].options.body),
    );
    expect(archiveBody).toEqual({ archived: true });
  });

  it("clears the selection when the search changes", async () => {
    setup();
    const dashboardRow = await screen.findByRole("row", {
      name: /Revenue overview/,
    });
    await userEvent.click(
      within(dashboardRow).getByRole("checkbox", { name: "Select row" }),
    );
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search..."), "sales");

    await waitFor(() =>
      expect(screen.queryByText("1 item selected")).not.toBeInTheDocument(),
    );
  });

  it("offers no row selection when remote sync is read-only", async () => {
    setup({ isRemoteSyncReadOnly: true });

    expect(await screen.findByText("Revenue overview")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("says the user has no access when they cannot read the Dashboards collection", async () => {
    setup({ canRead: false });

    expect(
      await screen.findByText("Sorry, you don’t have permission to see that."),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
    expect(screen.queryByText("No dashboards yet")).not.toBeInTheDocument();
  });

  it("offers to create the semantic layer when there is no library", async () => {
    setup({ hasLibrary: false });

    expect(
      await screen.findByText("Create my semantic layer"),
    ).toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { callMockEvent } from "__support__/events";
import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/common/hooks/use-before-unload";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { AdhocDashboardDefinition } from "metabase/urls";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

registerVisualizations();

const TEST_COLLECTION = createMockCollection();

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  settings: { "database-enable-actions": true },
});

const TEST_COLLECTION_ITEM = createMockCollectionItem({
  collection: TEST_COLLECTION,
  model: "dataset",
});

const TEST_CARD = createMockCard();

const TEST_TABLE = createMockTable();

const TestHome = () => <div />;

interface Options {
  dashboard?: Partial<Dashboard>;
  slug?: string;
}

async function setup({ dashboard, slug }: Options = {}) {
  const mockDashboard = createMockDashboard(dashboard);
  const dashboardId = mockDashboard.id;

  setupNotificationChannelsEndpoints({});

  setupDatabasesEndpoints([TEST_DATABASE_WITH_ACTIONS]);
  setupDashboardEndpoints(mockDashboard);
  setupDashboardQueryMetadataEndpoint(
    mockDashboard,
    createMockDashboardQueryMetadata({
      databases: [TEST_DATABASE_WITH_ACTIONS],
    }),
  );
  setupCollectionsEndpoints({ collections: [] });
  setupCollectionItemsEndpoint({
    collection: TEST_COLLECTION,
    collectionItems: [],
  });
  setupSearchEndpoints([TEST_COLLECTION_ITEM]);
  setupCardsEndpoints([TEST_CARD]);
  setupTableEndpoints(TEST_TABLE);

  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const mockEventListener = jest.spyOn(window, "addEventListener");

  const DashboardAppContainer = (props: any) => {
    return (
      <main>
        <link rel="icon" />
        <DashboardApp {...props} />
      </main>
    );
  };

  const { router, store } = renderWithProviders(
    <>
      <Route path="/" element={<TestHome />} />
      <Route path="/dashboard/:slug" element={<DashboardAppContainer />} />
    </>,
    {
      initialRoute: `/dashboard/${slug ?? dashboardId}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE_WITH_ACTIONS],
        }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    dashboardId,
    router: checkNotNull(router),
    store,
    mockEventListener,
  };
}

describe("DashboardApp", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("beforeunload events", () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it("should have a beforeunload event when the user tries to leave a dirty dashboard", async function () {
      const { mockEventListener } = await setup();

      await userEvent.click(await screen.findByLabelText("Edit dashboard"));
      await userEvent.click(screen.getByTestId("dashboard-name-heading"));
      await userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
      // need to click away from the input to trigger the isDirty flag
      await userEvent.tab();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not have a beforeunload event when the dashboard is unedited", async function () {
      const { mockEventListener } = await setup();

      await userEvent.click(await screen.findByLabelText("Edit dashboard"));

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });

    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const { dashboardId, router } = await setup();

      act(() => {
        router.navigate("/");
        router.navigate(`/dashboard/${dashboardId}`);
      });

      await waitForLoaderToBeRemoved();

      await userEvent.click(await screen.findByLabelText("Edit dashboard"));

      act(() => {
        router.back();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const { dashboardId, router } = await setup();

      act(() => {
        router.navigate("/");
        router.navigate(`/dashboard/${dashboardId}`);
      });

      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByLabelText("Edit dashboard"));
      await userEvent.click(screen.getByTestId("dashboard-name-heading"));
      await userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
      await userEvent.tab(); // need to click away from the input to trigger the isDirty flag

      act(() => {
        router.back();
      });

      expect(
        await screen.findByTestId("leave-confirmation"),
      ).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving with no changes via Cancel button", async () => {
      await setup();

      await userEvent.click(await screen.findByLabelText("Edit dashboard"));

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via Cancel button", async () => {
      await setup();

      await userEvent.click(await screen.findByLabelText("Edit dashboard"));
      await userEvent.click(screen.getByTestId("dashboard-name-heading"));
      await userEvent.type(screen.getByTestId("dashboard-name-heading"), "a");
      await userEvent.tab(); // need to click away from the input to trigger the isDirty flag

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });
  });

  describe("empty dashboard", () => {
    it("should prompt the user to add a question if they have write access", async () => {
      await setup();

      expect(screen.getByText(/add a chart/i)).toBeInTheDocument();
    });

    it("should show an empty state without the 'add a question' prompt if the user lacks write access", async () => {
      await setup({ dashboard: { can_write: false } });

      expect(screen.getByText("This dashboard is empty")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Add a chart" }),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * passing the same uuid in the URL is required to enable metadata cache
   * sharing on BE
   */
  it("should pass dashboard_load_id to dashboard and query_metadata endpoints", async () => {
    const { dashboardId } = await setup();

    const dashboardURL = fetchMock.callHistory.lastCall(
      `path:/api/dashboard/${dashboardId}`,
    )?.url;
    const queryMetadataURL = fetchMock.callHistory.lastCall(
      `path:/api/dashboard/${dashboardId}/query_metadata`,
    )?.url;

    const dashboardSearchParams = new URLSearchParams(
      dashboardURL?.split("?")[1],
    );
    const queryMetadataSearchParams = new URLSearchParams(
      queryMetadataURL?.split("?")[1],
    );

    expect(dashboardSearchParams.get("dashboard_load_id")).toHaveLength(36); // uuid length
    expect(queryMetadataSearchParams.get("dashboard_load_id")).toHaveLength(36); // uuid length

    expect(queryMetadataSearchParams.get("dashboard_load_id")).toEqual(
      dashboardSearchParams.get("dashboard_load_id"),
    );
  });

  it("should show the error page instead of an endless loader for a non-numeric slug (metabase#78725)", async () => {
    const { store } = await setup({ slug: "thisisinvalid" });

    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(store.getState().app.errorPage).toMatchObject({ status: 404 });
  });

  it("should not allow to enter a dashboard name longer than 254 characters", async () => {
    await setup();

    const input = await screen.findByPlaceholderText("Add title");
    await userEvent.clear(input);
    await userEvent.paste("A".repeat(256));

    expect(input).toHaveValue("A".repeat(254));
  });
});

describe("DashboardApp ad-hoc dashboards", () => {
  const definition: AdhocDashboardDefinition = {
    name: "Ops overview",
    description: "Key ops charts.",
    tiles: [
      {
        title: "Venues by price",
        display: "bar",
        dataset_query: createMockStructuredDatasetQuery({ database: 1 }),
        row: 0,
        col: 0,
        size_x: 12,
        size_y: 6,
      },
      {
        title: "All venues",
        display: "table",
        dataset_query: createMockStructuredDatasetQuery({ database: 2 }),
        row: 0,
        col: 12,
        size_x: 12,
        size_y: 6,
      },
    ],
  };

  const setupAdhoc = (adhocDefinition: AdhocDashboardDefinition) => {
    setupNotificationChannelsEndpoints({});
    setupDatabasesEndpoints([TEST_DATABASE_WITH_ACTIONS]);
    setupCollectionsEndpoints({ collections: [] });
    setupCollectionByIdEndpoint({ collections: [] });
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    setupRecentViewsAndSelectionsEndpoints(
      [],
      ["selections", "views"],
      {},
      false,
    );
    setupBookmarksEndpoints([]);
    setupCardDataset();

    return renderWithProviders(
      <>
        <Route path="/dashboard/adhoc" element={<DashboardApp />} />
        <Route path="/dashboard/:slug" element={<div>saved dashboard</div>} />
      </>,
      {
        initialRoute: Urls.adhocDashboard(adhocDefinition),
        withRouter: true,
        storeInitialState: {
          dashboard: createMockDashboardState(),
          entities: createMockEntitiesState({
            databases: [TEST_DATABASE_WITH_ACTIONS],
          }),
          settings: mockSettings({ "site-url": "http://localhost:3000" }),
        },
      },
    );
  };

  it("renders a hash-defined dashboard through the regular dashboard page, read-only", async () => {
    setupAdhoc(definition);

    expect(await screen.findByText("Ops overview")).toBeInTheDocument();
    expect(await screen.findByText("Venues by price")).toBeInTheDocument();
    expect(await screen.findByText("All venues")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit dashboard")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("save-adhoc-dashboard-button"),
    ).not.toBeInTheDocument();
  });

  it("offers to save a Metabot-generated dashboard and opens the saved dashboard", async () => {
    fetchMock.post(
      "express:/api/metabot/conversations/:id/saved-dashboard",
      { id: 9, name: "Ops overview", description: null, collection_id: null },
      {
        name: "save-dashboard",
        matchPartialBody: true,
        body: { dashboard_id: "dash-1", dashboard: { name: "Ops overview" } },
      },
    );
    setupAdhoc({
      ...definition,
      metabot: { conversation_id: "convo-1", dashboard_id: "dash-1" },
    });

    await userEvent.click(
      await screen.findByTestId("save-adhoc-dashboard-button"),
    );
    const modal = await screen.findByTestId("save-dashboard-modal");
    expect(within(modal).getByLabelText("Name")).toHaveValue("Ops overview");

    const saveButton = within(modal).getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock.callHistory.called("save-dashboard")).toBe(true);
    });
    expect(await screen.findByText("saved dashboard")).toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { callMockEvent } from "__support__/events";
import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupListSubscriptionsEndpoint,
  setupNotificationChannelsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
} from "__support__/ui";
import { getBeforeUnloadUnsavedMessage } from "metabase/common/hooks/use-before-unload";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { getIsSharing } from "metabase/dashboard/selectors";
import { Route } from "metabase/router";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockChannel,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardSubscription,
  createMockDatabase,
  createMockDataset,
  createMockHeadingDashboardCard,
  createMockTable,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

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
  /** Holds the query metadata response until `resolveQueryMetadata` is called. */
  deferQueryMetadata?: boolean;
  channels?: Parameters<typeof setupNotificationChannelsEndpoints>[0];
}

function renderDashboardApp({
  dashboard,
  slug,
  deferQueryMetadata = false,
  channels = {},
}: Options = {}) {
  const mockDashboard = createMockDashboard(dashboard);
  const dashboardId = mockDashboard.id;
  const queryMetadata = createMockDashboardQueryMetadata({
    databases: [TEST_DATABASE_WITH_ACTIONS],
  });
  const queryMetadataRequest = defer();

  setupNotificationChannelsEndpoints(channels);

  setupDatabasesEndpoints([TEST_DATABASE_WITH_ACTIONS]);
  setupDashboardEndpoints(mockDashboard);
  if (deferQueryMetadata) {
    fetchMock.get(`path:/api/dashboard/${dashboardId}/query_metadata`, () =>
      queryMetadataRequest.promise.then(() => queryMetadata),
    );
  } else {
    setupDashboardQueryMetadataEndpoint(mockDashboard, queryMetadata);
  }
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

  return {
    dashboardId,
    router: checkNotNull(router),
    store,
    mockEventListener,
    resolveQueryMetadata: () => queryMetadataRequest.resolve(),
  };
}

async function setup(options: Options = {}) {
  const view = renderDashboardApp(options);

  await waitForDashboardToLoad();

  return view;
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
      expect(mockEvent.returnValue).toEqual(getBeforeUnloadUnsavedMessage());
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

      await waitForDashboardToLoad();

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

      await waitForDashboardToLoad();

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

  describe("subscriptions hash", () => {
    const subscription = createMockDashboardSubscription({
      id: 12,
      channels: [createMockChannel({ schedule_type: "hourly" })],
    });
    const channels: Options["channels"] = {
      email: {
        type: "email",
        name: "Email",
        configured: true,
        allows_recipients: true,
        recipients: ["user", "email"],
        schedules: ["hourly", "daily", "weekly", "monthly"],
      },
    };
    const dashcard = createMockDashboardCard({ card: TEST_CARD });
    const dashboard: Options["dashboard"] = { dashcards: [dashcard] };

    beforeEach(() => {
      setupDashcardQueryEndpoints(
        createMockDashboard().id,
        dashcard,
        createMockDataset(),
      );
      setupListSubscriptionsEndpoint([subscription]);
      setupUserRecipientsEndpoint({ users: [] });
    });

    afterEach(() => {
      window.location.hash = "";
    });

    it("opens the subscriptions sidebar when the URL asks for it", async () => {
      // DashboardApp reads hash options from window.location, which the memory router does not set
      window.location.hash = "#subscriptions";
      const { router } = await setup({ dashboard, channels });

      expect(await screen.findByText("Emailed hourly")).toBeInTheDocument();
      expect(router.location.hash).toBe("");
    });

    it("opens the edit form of the subscription named in the URL", async () => {
      window.location.hash = "#subscriptions=12";
      await setup({ dashboard, channels });

      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();
    });

    it("opens the subscriptions list when the subscription id in the URL is not a number", async () => {
      window.location.hash = "#subscriptions=abc";
      await setup({ dashboard, channels });

      expect(await screen.findByText("Emailed hourly")).toBeInTheDocument();
      expect(
        screen.queryByText("Email this dashboard"),
      ).not.toBeInTheDocument();
    });

    it.each<{ name: string; options: Options }>([
      {
        name: "no email or Slack is set up for a non-admin",
        options: { dashboard, channels: {} },
      },
      {
        name: "the dashboard has no card with data to send",
        options: {
          dashboard: { dashcards: [createMockTextDashboardCard()] },
          channels,
        },
      },
    ])(
      "keeps the sidebar closed and drops the hash when $name",
      async ({ options }) => {
        window.location.hash = "#subscriptions=12";
        const { router, store } = await setup(options);

        await waitFor(() => expect(router.location.hash).toBe(""));
        expect(getIsSharing(store.getState())).toBe(false);
        expect(
          screen.queryByText("Email this dashboard"),
        ).not.toBeInTheDocument();
      },
    );

    it("keeps the subscriptions sidebar closed otherwise", async () => {
      const { store } = await setup({ dashboard, channels });

      expect(getIsSharing(store.getState())).toBe(false);
    });
  });

  it("should show the error page instead of an endless loader for a non-numeric slug (metabase#78725)", async () => {
    const { store } = await setup({ slug: "thisisinvalid" });

    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(store.getState().app.errorPage).toMatchObject({ status: 404 });
  });

  describe("loading state (DSN-749)", () => {
    it("renders the dashboard with skeletons, instead of a loading spinner, while it loads", async () => {
      renderDashboardApp();

      // The real dashboard page renders right away, with skeletons for its
      // header and grid, and a loading spinner is never shown.
      expect(screen.getByTestId("dashboard")).toBeInTheDocument();
      expect(
        screen.getByTestId("dashboard-header-skeleton"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("dashboard-grid-skeleton")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

      // Once the dashboard arrives, its real header and grid replace them.
      await waitForDashboardToLoad();
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    it("switches to the dashboard's real card layout as soon as it is known, before the load finishes", async () => {
      const { resolveQueryMetadata } = renderDashboardApp({
        dashboard: {
          dashcards: [
            createMockHeadingDashboardCard({ id: 1, text: "Heading" }),
            createMockTextDashboardCard({
              id: 2,
              text: "First line\nSecond line",
            }),
          ],
        },
        deferQueryMetadata: true,
      });

      try {
        // These can only come from the dashboard's own layout, drawn while
        // its query metadata loads.
        expect(
          await screen.findAllByTestId("dashboard-skeleton-text"),
        ).toHaveLength(2);
      } finally {
        resolveQueryMetadata();
      }

      await waitForDashboardToLoad();
      expect(
        screen.queryByTestId("dashboard-skeleton-text"),
      ).not.toBeInTheDocument();
    });
  });

  it("should not allow to enter a dashboard name longer than 254 characters", async () => {
    await setup();

    const input = await screen.findByPlaceholderText("Add title");
    await userEvent.clear(input);
    await userEvent.paste("A".repeat(256));

    expect(input).toHaveValue("A".repeat(254));
  });
});

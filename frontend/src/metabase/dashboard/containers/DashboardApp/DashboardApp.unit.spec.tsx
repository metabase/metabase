import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { callMockEvent } from "__support__/events";
import {
  setupActionsEndpoints,
  setupAuditInfoEndpoint,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupRevisionsEndpoints,
  setupSearchEndpoints,
  setupTableEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  setupNotificationChannelsEndpoints,
  setupSubscriptionsEndpoint,
} from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { getBeforeUnloadUnsavedMessage } from "metabase/common/hooks/use-before-unload";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { Route } from "metabase/router";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import type { Dashboard, DashboardId, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDatabase,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockTable,
  createMockTextDashboardCard,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

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

// Like the real API, a GET after a PUT returns the updated dashboard
function setupPersistedDashboardEndpoints(dashboard: Dashboard) {
  let persistedDashboard = dashboard;
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}`,
    () => persistedDashboard,
  );
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    if (!isObject(body) || Array.isArray(body)) {
      throw new Error("Expected a dashboard update object");
    }
    persistedDashboard = {
      ...persistedDashboard,
      ...body,
    };
    return persistedDashboard;
  });
}

interface Options {
  dashboard?: Partial<Dashboard>;
  slug?: string;
  currentUser?: User;
  /** Holds the dashboard response until `resolveDashboard` is called. */
  deferDashboard?: boolean;
  /** Holds the query metadata response until `resolveQueryMetadata` is called. */
  deferQueryMetadata?: boolean;
}

function renderDashboardApp({
  dashboard,
  slug,
  deferQueryMetadata = false,
  currentUser = createMockUser(),
  deferDashboard = false,
}: Options = {}) {
  const mockDashboard = createMockDashboard(dashboard);
  const dashboardId = mockDashboard.id;
  const queryMetadata = createMockDashboardQueryMetadata({
    databases: [TEST_DATABASE_WITH_ACTIONS],
  });
  const queryMetadataRequest = defer();
  const dashboardRequest = defer();

  setupNotificationChannelsEndpoints({});

  setupDatabasesEndpoints([TEST_DATABASE_WITH_ACTIONS]);
  if (deferDashboard) {
    fetchMock.get(`path:/api/dashboard/${dashboardId}`, () =>
      dashboardRequest.promise.then(() => mockDashboard),
    );
  } else {
    setupPersistedDashboardEndpoints(mockDashboard);
  }
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
        currentUser,
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
    resolveDashboard: () => dashboardRequest.resolve(),
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

    describe("in editing mode", () => {
      const NO_CREATE_PROMPT =
        "Browse your collections to find and add existing questions.";
      const CREATE_PROMPT =
        "Create a new question or browse your collections for an existing one.";

      const userWithPermissions = (canCreateQueries: boolean) =>
        createMockUser({
          permissions: createMockUserPermissions({
            can_create_queries: canCreateQueries,
            can_create_native_queries: false,
          }),
        });

      it("should suggest creating a question to a user who can create queries", async () => {
        await setup({ currentUser: userWithPermissions(true) });

        await userEvent.click(screen.getByLabelText("Edit dashboard"));

        expect(screen.getByText(CREATE_PROMPT)).toBeInTheDocument();
        expect(screen.queryByText(NO_CREATE_PROMPT)).not.toBeInTheDocument();
      });

      it("should not suggest creating a question to a user who cannot create queries on an empty dashboard (metabase#44937)", async () => {
        await setup({ currentUser: userWithPermissions(false) });

        await userEvent.click(screen.getByLabelText("Edit dashboard"));

        expect(screen.getByText(NO_CREATE_PROMPT)).toBeInTheDocument();
        expect(screen.queryByText(CREATE_PROMPT)).not.toBeInTheDocument();
      });

      it("should not suggest creating a question to a user who cannot create queries on an empty tab (metabase#44937)", async () => {
        await setup({
          currentUser: userWithPermissions(false),
          dashboard: {
            tabs: [
              createMockDashboardTab({ id: 1, name: "Tab 1" }),
              createMockDashboardTab({ id: 2, name: "Tab 2" }),
            ],
            dashcards: [
              createMockTextDashboardCard({
                id: 1,
                dashboard_tab_id: 1,
                text: "Card on the first tab",
              }),
            ],
          },
        });

        await userEvent.click(screen.getByLabelText("Edit dashboard"));
        expect(screen.queryByText(NO_CREATE_PROMPT)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));

        expect(await screen.findByText(NO_CREATE_PROMPT)).toBeInTheDocument();
        expect(screen.queryByText(CREATE_PROMPT)).not.toBeInTheDocument();
      });
    });
  });

  it("should let the values of a filter be edited once the filter linked to it is removed (metabase#49556)", async () => {
    const targetParameter = createMockParameter({
      id: "target",
      name: "Target",
      slug: "target",
      type: "category",
      filteringParameters: ["source"],
    });
    const sourceParameter = createMockParameter({
      id: "source",
      name: "Source",
      slug: "source",
      type: "category",
    });
    setupSubscriptionsEndpoint([]);
    await setup({
      dashboard: { parameters: [targetParameter, sourceParameter] },
    });

    await userEvent.click(screen.getByLabelText("Edit dashboard"));
    const filters = screen.getByTestId("fixed-width-filters");

    await userEvent.click(within(filters).getByText("Target"));
    const sidebar = await screen.findByTestId("dashboard-parameter-sidebar");
    expect(
      within(sidebar).getByRole("button", { name: "Edit" }),
    ).toBeDisabled();

    await userEvent.click(within(filters).getByText("Source"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(within(filters).queryByText("Source")).not.toBeInTheDocument(),
    );

    await userEvent.click(within(filters).getByText("Target"));
    expect(
      within(
        await screen.findByTestId("dashboard-parameter-sidebar"),
      ).getByRole("button", { name: "Edit" }),
    ).toBeEnabled();
  });

  it("should not show an error when the fetch of a dashboard is cancelled by opening another one (metabase#47170)", async () => {
    const otherDashboard = createMockDashboard({
      id: 2,
      name: "Dashboard A",
    });
    setupDashboardEndpoints(otherDashboard);
    setupDashboardQueryMetadataEndpoint(
      otherDashboard,
      createMockDashboardQueryMetadata(),
    );

    const { router, store, resolveDashboard } = renderDashboardApp({
      deferDashboard: true,
    });

    try {
      expect(
        await screen.findByTestId("dashboard-header-skeleton"),
      ).toBeInTheDocument();

      act(() => {
        router.navigate(`/dashboard/${otherDashboard.id}`);
      });

      await waitForDashboardToLoad();
      expect(
        await screen.findByDisplayValue(otherDashboard.name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Something’s gone wrong"),
      ).not.toBeInTheDocument();
      expect(store.getState().app.errorPage).toBeNull();
    } finally {
      resolveDashboard();
    }
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

  describe("title and description", () => {
    const ORIGINAL_NAME = "Amazing Dashboard";
    const NEW_NAME = "Renamed";
    const NEW_DESCRIPTION = "Foo Bar";

    const getUpdateCalls = (dashboardId: DashboardId) =>
      fetchMock.callHistory.calls(`path:/api/dashboard/${dashboardId}`, {
        method: "PUT",
      });

    // Waits a while to make sure that no other update request is sent later
    const expectNoMoreUpdates = async (
      dashboardId: DashboardId,
      count: number,
    ) => {
      await expect(
        waitFor(
          () =>
            expect(getUpdateCalls(dashboardId).length).toBeGreaterThan(count),
          { timeout: 1000 },
        ),
      ).rejects.toThrow();
      expect(getUpdateCalls(dashboardId)).toHaveLength(count);
    };

    const getUpdateBody = async (
      dashboardId: DashboardId,
      index: number,
    ): Promise<unknown> => {
      const body: unknown = JSON.parse(
        String(getUpdateCalls(dashboardId)[index].options.body),
      );
      return body;
    };

    const getTitleInput = () => screen.getByTestId("dashboard-name-heading");

    async function renameTitle(name: string) {
      await userEvent.clear(getTitleInput());
      await userEvent.type(getTitleInput(), name);
      await userEvent.tab();
    }

    async function typeDescription(text: string) {
      const sidesheet = await screen.findByTestId("sidesheet");
      await userEvent.click(within(sidesheet).getByTestId("editable-text"));
      await userEvent.type(
        within(sidesheet).getByPlaceholderText("Add description"),
        text,
      );
    }

    beforeEach(() => {
      setupRevisionsEndpoints([]);
      setupUsersEndpoints([createMockUser()]);
      setupAuditInfoEndpoint();
    });

    it("should update the name and the description without entering the edit mode (metabase#31721)", async () => {
      const { dashboardId } = await setup({
        dashboard: { name: ORIGINAL_NAME },
      });

      await renameTitle(NEW_NAME);
      await waitFor(() => expect(getUpdateCalls(dashboardId)).toHaveLength(1));
      expect(await getUpdateBody(dashboardId, 0)).toEqual({ name: NEW_NAME });
      expect(getTitleInput()).toHaveValue(NEW_NAME);
      expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("More info"));
      await typeDescription(NEW_DESCRIPTION);
      await userEvent.tab();
      await waitFor(() => expect(getUpdateCalls(dashboardId)).toHaveLength(2));
      expect(await getUpdateBody(dashboardId, 1)).toEqual({
        description: NEW_DESCRIPTION,
      });
      expect(
        within(screen.getByTestId("sidesheet")).getByText(NEW_DESCRIPTION),
      ).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("sidesheet")).getByRole("button", {
          name: "Close",
        }),
      );
      await expectNoMoreUpdates(dashboardId, 2);
    });

    it("should revert the title and the description changes on Escape", async () => {
      const { dashboardId } = await setup({
        dashboard: { name: ORIGINAL_NAME, description: NEW_DESCRIPTION },
      });

      await userEvent.type(getTitleInput(), "Whatever{Escape}");
      expect(getTitleInput()).toHaveValue(ORIGINAL_NAME);

      await userEvent.click(screen.getByLabelText("More info"));
      await typeDescription("Baz{Escape}");
      expect(
        within(screen.getByTestId("sidesheet")).getByText(NEW_DESCRIPTION),
      ).toBeInTheDocument();

      expect(getUpdateCalls(dashboardId)).toHaveLength(0);
    });

    it("should revert the title change when editing is cancelled", async () => {
      const { dashboardId } = await setup({
        dashboard: { name: ORIGINAL_NAME },
      });

      await userEvent.click(screen.getByLabelText("Edit dashboard"));
      await renameTitle(NEW_NAME);
      await userEvent.click(
        within(screen.getByTestId("edit-bar")).getByRole("button", {
          name: "Cancel",
        }),
      );
      await userEvent.click(
        within(await screen.findByTestId("leave-confirmation")).getByRole(
          "button",
          { name: "Discard changes" },
        ),
      );

      await waitFor(() =>
        expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
      );
      // Cancel hides the edit bar before the refetch restores the title
      await waitFor(() => expect(getTitleInput()).toHaveValue(ORIGINAL_NAME));
      expect(getUpdateCalls(dashboardId)).toHaveLength(0);
    });

    it("should keep the edit mode when the title is changed and save it with the dashboard", async () => {
      const { dashboardId } = await setup({
        dashboard: { name: ORIGINAL_NAME },
      });

      await userEvent.click(screen.getByLabelText("Edit dashboard"));
      await renameTitle(NEW_NAME);
      expect(screen.getByTestId("edit-bar")).toBeInTheDocument();
      expect(getUpdateCalls(dashboardId)).toHaveLength(0);

      await userEvent.click(
        within(screen.getByTestId("edit-bar")).getByRole("button", {
          name: "Save",
        }),
      );
      await waitFor(() => expect(getUpdateCalls(dashboardId)).toHaveLength(1));
      expect(await getUpdateBody(dashboardId, 0)).toMatchObject({
        name: NEW_NAME,
      });
    });

    it("should save the description right away in the edit mode", async () => {
      const { dashboardId } = await setup({
        dashboard: {
          "last-edit-info": {
            id: 1,
            email: "user@metabase.test",
            first_name: "Testy",
            last_name: "Tableton",
            timestamp: "2024-01-01T00:00:00Z",
          },
        },
      });

      await userEvent.click(screen.getByLabelText("Edit dashboard"));
      // The only way to open the info sidebar in the edit mode
      await userEvent.click(
        within(screen.getByTestId("dashboard-header")).getByText(/^Edited/),
      );
      await typeDescription(NEW_DESCRIPTION);
      await userEvent.tab();
      await waitFor(() => expect(getUpdateCalls(dashboardId)).toHaveLength(1));
      expect(await getUpdateBody(dashboardId, 0)).toEqual({
        description: NEW_DESCRIPTION,
      });
      expect(screen.getByTestId("edit-bar")).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("sidesheet")).getByRole("button", {
          name: "Close",
        }),
      );
      await userEvent.click(
        within(screen.getByTestId("edit-bar")).getByRole("button", {
          name: "Save",
        }),
      );
      await waitFor(() => expect(getUpdateCalls(dashboardId)).toHaveLength(2));
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

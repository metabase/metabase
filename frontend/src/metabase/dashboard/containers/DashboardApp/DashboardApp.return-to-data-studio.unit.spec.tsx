import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
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
import type { DataStudioReturnState } from "metabase/common/data-studio/utils/return-to";
import { getNewQuestionUrl } from "metabase/dashboard/components/QuestionPicker/actions";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { Route, useNavigate } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockDataset,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const CARD = createMockCard({ id: 1 });
const DASHCARD = createMockDashboardCard({
  id: 1,
  dashboard_id: 1,
  card_id: CARD.id,
  card: CARD,
});
const DASHBOARD = createMockDashboard({
  id: 1,
  name: "Sales",
  dashcards: [DASHCARD],
});
const LIBRARY_COLLECTION = createMockCollection({
  id: 20,
  name: "Dashboards",
  type: "library-dashboards",
});
const LIBRARY_DASHBOARD: Dashboard = {
  ...DASHBOARD,
  collection_id: LIBRARY_COLLECTION.id,
  collection: LIBRARY_COLLECTION,
};
const OTHER_DASHBOARD = createMockDashboard({ id: 2, name: "Marketing" });
const DATA_STUDIO_PATH = "/data-studio/dashboards/1";
const NEW_QUESTION_PATH = "/question/notebook";

type SetupOpts = {
  returnState?: DataStudioReturnState;
  dashboard?: Dashboard;
  hash?: string;
  isAdmin?: boolean;
  hasLibrary?: boolean;
};

function OpenDashboardButton({
  returnState,
  hash = "",
}: Pick<SetupOpts, "returnState" | "hash">) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() =>
        navigate(`/dashboard/${DASHBOARD.id}${hash}`, { state: returnState })
      }
    >
      Open dashboard
    </button>
  );
}

async function renderDashboardApp({
  returnState,
  dashboard = DASHBOARD,
  hash,
  isAdmin = false,
  hasLibrary = false,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "site-url": "http://localhost:3000",
    "token-features": createMockTokenFeatures({ library: hasLibrary }),
  });
  if (hasLibrary) {
    setupEnterpriseOnlyPlugin("library");
  }
  const collections = dashboard.collection ? [dashboard.collection] : [];
  const database = createMockDatabase();
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([database]);
  // Registered first so it wins over the shared mock, which echoes the request
  // back and so drops the `card` the real response hydrates on each dashcard
  fetchMock.put(`path:/api/dashboard/${dashboard.id}`, dashboard);
  [dashboard, OTHER_DASHBOARD].forEach((mockDashboard) => {
    setupDashboardEndpoints(mockDashboard);
    setupDashboardQueryMetadataEndpoint(
      mockDashboard,
      createMockDashboardQueryMetadata({
        databases: [database],
        cards: [CARD],
      }),
    );
  });
  setupDashcardQueryEndpoints(DASHBOARD.id, DASHCARD, createMockDataset());
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });
  setupSearchEndpoints([]);
  setupCardsEndpoints([CARD]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);

  const { router } = renderWithProviders(
    <>
      <Route
        path="/"
        element={<OpenDashboardButton returnState={returnState} hash={hash} />}
      />
      <Route path="/dashboard/:slug" element={<DashboardApp />} />
      <Route
        path="/data-studio/dashboards/:dashboardId"
        element={<div>Data Studio dashboard</div>}
      />
      <Route path={NEW_QUESTION_PATH} element={<div>New question</div>} />
    </>,
    {
      initialRoute: "/",
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: isAdmin }),
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings,
      },
    },
  );
  const testRouter = checkNotNull(router);
  const visitedPaths: string[] = [];
  testRouter.onLocationChange((location) =>
    visitedPaths.push(location.pathname),
  );

  // DashboardApp reads the edit hash from window.location, which the memory router neither sets nor clears
  window.location.hash = hash ?? "";
  await userEvent.click(screen.getByRole("button", { name: "Open dashboard" }));
  await waitForDashboardToLoad();
  window.location.hash = "";

  return { router: testRouter, visitedPaths };
}

async function setup(opts: SetupOpts = {}) {
  const view = await renderDashboardApp(opts);
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
  expect(await screen.findByRole("button", { name: "Save" })).toBeVisible();
  return view;
}

async function renameDashboard() {
  const heading = screen.getByTestId("dashboard-name-heading");
  await userEvent.type(heading, " v2");
  await userEvent.tab();
}

function getRequestCount() {
  return fetchMock.callHistory.calls().length;
}

function getDashboardRequestsSince(requestCount: number) {
  return fetchMock.callHistory
    .calls()
    .slice(requestCount)
    .map((call) => ({
      method: (call.options.method ?? "get").toUpperCase(),
      pathname: new URL(call.url).pathname,
    }))
    .filter(({ pathname }) =>
      pathname.startsWith(`/api/dashboard/${DASHBOARD.id}`),
    )
    .map(({ method, pathname }) => `${method} ${pathname}`);
}

async function settleRequests() {
  let requestCount;
  do {
    requestCount = getRequestCount();
    await act(() => fetchMock.callHistory.flush(true));
  } while (getRequestCount() !== requestCount);
}

const RETURN_STATE: DataStudioReturnState = { returnTo: DATA_STUDIO_PATH };

describe("DashboardApp return to Data Studio", () => {
  it("returns to Data Studio once after saving changes", async () => {
    const { router, visitedPaths } = await setup({ returnState: RETURN_STATE });

    await renameDashboard();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(`path:/api/dashboard/${DASHBOARD.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1),
    );
    expect(router.location.pathname).toBe(DATA_STUDIO_PATH);
    expect(visitedPaths.filter((path) => path === DATA_STUDIO_PATH)).toEqual([
      DATA_STUDIO_PATH,
    ]);
  });

  it("returns to Data Studio after saving without changes", async () => {
    const { router } = await setup({ returnState: RETURN_STATE });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    expect(router.location.pathname).toBe(DATA_STUDIO_PATH);
  });

  it("returns to Data Studio on Cancel", async () => {
    const { router } = await setup({ returnState: RETURN_STATE });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    expect(router.location.pathname).toBe(DATA_STUDIO_PATH);
  });

  it("returns to Data Studio after discarding changes, asking only once", async () => {
    const { router } = await setup({ returnState: RETURN_STATE });

    await renameDashboard();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );

    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    expect(router.location.pathname).toBe(DATA_STUDIO_PATH);
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });

  it("does not reload the dashboard after saving returns to Data Studio", async () => {
    await setup({ returnState: RETURN_STATE });
    await renameDashboard();
    const requestCount = getRequestCount();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    await settleRequests();

    expect(getDashboardRequestsSince(requestCount)).toEqual([
      `PUT /api/dashboard/${DASHBOARD.id}`,
    ]);
  });

  it("does not reload the dashboard after canceling returns to Data Studio", async () => {
    await setup({ returnState: RETURN_STATE });
    const requestCount = getRequestCount();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    await settleRequests();

    expect(getDashboardRequestsSince(requestCount)).toEqual([]);
  });

  it("replaces the dashboard history entry when returning to Data Studio", async () => {
    const { router } = await setup({ returnState: RETURN_STATE });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    act(() => router.back());

    await waitFor(() => expect(router.location.pathname).toBe("/"));
  });

  it("stays on the dashboard when it was not opened from Data Studio", async () => {
    const { router, visitedPaths } = await setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByLabelText("Edit dashboard")).toBeInTheDocument();
    expect(router.location.pathname).toBe(`/dashboard/${DASHBOARD.id}`);
    expect(visitedPaths).not.toContain(DATA_STUDIO_PATH);
  });

  it("does not return to Data Studio when switching dashboards while editing", async () => {
    const { router, visitedPaths } = await setup({ returnState: RETURN_STATE });

    act(() => {
      router.navigate(`/dashboard/${OTHER_DASHBOARD.id}`);
    });

    expect(await screen.findByDisplayValue(OTHER_DASHBOARD.name)).toBeVisible();
    expect(router.location.pathname).toBe(`/dashboard/${OTHER_DASHBOARD.id}`);
    expect(visitedPaths).not.toContain(DATA_STUDIO_PATH);
  });

  it("continues to the new question after saving from the leave confirmation", async () => {
    const { router, visitedPaths } = await setup({ returnState: RETURN_STATE });

    await renameDashboard();
    act(() => {
      router.navigate(
        getNewQuestionUrl({ dashboard: DASHBOARD, type: "notebook" }),
      );
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Save changes" }),
    );

    expect(await screen.findByText("New question")).toBeVisible();
    expect(router.location.pathname).toBe(NEW_QUESTION_PATH);
    expect(visitedPaths).not.toContain(DATA_STUDIO_PATH);
  });
});

describe("DashboardApp editing a Library dashboard", () => {
  it("returns to Data Studio when the editor opens from the URL", async () => {
    const { router } = await renderDashboardApp({
      dashboard: LIBRARY_DASHBOARD,
      hash: "#edit=true",
      isAdmin: true,
      hasLibrary: true,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    expect(await screen.findByText("Data Studio dashboard")).toBeVisible();
    expect(router.location.pathname).toBe(DATA_STUDIO_PATH);
  });

  it("stays on the dashboard for a user without Data Studio access", async () => {
    const { router, visitedPaths } = await renderDashboardApp({
      dashboard: LIBRARY_DASHBOARD,
      hash: "#edit=true",
      hasLibrary: true,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument(),
    );
    expect(router.location.pathname).toBe(`/dashboard/${DASHBOARD.id}`);
    expect(visitedPaths).not.toContain(DATA_STUDIO_PATH);
  });
});

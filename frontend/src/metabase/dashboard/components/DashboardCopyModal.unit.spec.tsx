import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Dashboard, DashboardCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardCopyModalConnected } from "./DashboardCopyModal";

const DASHBOARD_ID = 1;
const DASHBOARD_NAME = "Sales overview";
const DASHBOARD_URL = `path:/api/dashboard/${DASHBOARD_ID}`;
const COLLECTION = createMockCollection({ id: 5, name: "Sales" });

const COLLECTION_QUESTION_DASHCARD = createMockDashboardCard({
  id: 1,
  dashboard_id: DASHBOARD_ID,
  card_id: 10,
  card: createMockCard({
    id: 10,
    name: "Collection question",
    dashboard_id: null,
  }),
});

const HEADING_DASHCARD = createMockHeadingDashboardCard({
  id: 2,
  dashboard_id: DASHBOARD_ID,
  row: 1,
});

const DASHBOARD_QUESTION_DASHCARD = createMockDashboardCard({
  id: 3,
  dashboard_id: DASHBOARD_ID,
  card_id: 30,
  row: 2,
  card: createMockCard({
    id: 30,
    name: "Dashboard question",
    dashboard_id: DASHBOARD_ID,
  }),
});

type SetupOpts = {
  dashcards: DashboardCard[];
};

function setup({ dashcards }: SetupOpts) {
  const dashboard: Dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    name: DASHBOARD_NAME,
    collection_id: COLLECTION.id,
    collection: COLLECTION,
    dashcards,
  });

  setupDashboardEndpoints(dashboard);
  setupCollectionsEndpoints({ collections: [COLLECTION] });
  setupCollectionByIdEndpoint({ collections: [COLLECTION] });

  const onClose = jest.fn<void, []>();

  renderWithProviders(
    <Route
      path="dashboard/:slug/copy"
      element={<DashboardCopyModalConnected onClose={onClose} />}
    />,
    {
      withRouter: true,
      initialRoute: `/dashboard/${DASHBOARD_ID}/copy`,
      storeInitialState: createMockState({
        currentUser: createMockUser(),
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          dashboards: {
            [DASHBOARD_ID]: createMockStoreDashboard({
              ...dashboard,
              dashcards: dashcards.map(({ id }) => id),
            }),
          },
          dashcards: Object.fromEntries(dashcards.map((dc) => [dc.id, dc])),
        }),
      }),
    },
  );

  return { onClose };
}

describe("DashboardCopyModal", () => {
  it("offers a shallow copy when the dashboard only uses collection questions", async () => {
    setup({ dashcards: [COLLECTION_QUESTION_DASHCARD, HEADING_DASHCARD] });

    expect(
      await screen.findByRole("checkbox", {
        name: /Only duplicate the dashboard/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue(
      `${DASHBOARD_NAME} - Duplicate`,
    );
  });

  it("does not offer a shallow copy when the dashboard has dashboard questions", async () => {
    setup({
      dashcards: [
        COLLECTION_QUESTION_DASHCARD,
        HEADING_DASHCARD,
        DASHBOARD_QUESTION_DASHCARD,
      ],
    });

    expect(
      await screen.findByRole("heading", {
        name: `Duplicate "${DASHBOARD_NAME}" and its questions`,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Name")).toHaveValue(
      `${DASHBOARD_NAME} - Duplicate`,
    );
    // the checkbox is also hidden while the dashboard loads, so wait for it
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(DASHBOARD_URL)).toHaveLength(1),
    );
    await act(() => fetchMock.callHistory.flush(true));
    expect(
      screen.queryByRole("checkbox", { name: /Only duplicate the dashboard/ }),
    ).not.toBeInTheDocument();
  });
});

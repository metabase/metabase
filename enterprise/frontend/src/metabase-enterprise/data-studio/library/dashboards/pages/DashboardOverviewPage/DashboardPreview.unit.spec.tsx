import fetchMock from "fetch-mock";

import {
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { getIsAutoApplyFilters } from "metabase/dashboard/selectors";
import { defer } from "metabase/utils/promise";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Dashboard,
  DashboardQueryMetadata,
  Dataset,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockDataset,
} from "metabase-types/api/mocks";

import { DashboardPreview } from "./DashboardPreview";

registerVisualizations();

const DATABASE = createMockDatabase();

function createDashboard(id: number, cardName: string): Dashboard {
  const card = createMockCard({ id, name: cardName });
  return createMockDashboard({
    id,
    name: `Dashboard ${id}`,
    dashcards: [
      createMockDashboardCard({ id, dashboard_id: id, card_id: id, card }),
    ],
  });
}

const SALES = createDashboard(1, "Revenue by month");
const ORDERS = createDashboard(2, "Orders by state");

type SetupOpts = {
  pendingMetadataDashboard?: Dashboard;
  pendingQueryDashboard?: Dashboard;
};

function setup({
  pendingMetadataDashboard,
  pendingQueryDashboard,
}: SetupOpts = {}) {
  const pendingMetadata = defer<DashboardQueryMetadata>();
  const pendingQuery = defer<Dataset>();
  setupDatabasesEndpoints([DATABASE]);
  [SALES, ORDERS].forEach((dashboard) => {
    const [dashcard] = dashboard.dashcards;
    if (dashboard === pendingMetadataDashboard) {
      fetchMock.get(
        `path:/api/dashboard/${dashboard.id}/query_metadata`,
        pendingMetadata.promise,
      );
    } else {
      setupDashboardQueryMetadataEndpoint(
        dashboard,
        createMockDashboardQueryMetadata({ databases: [DATABASE] }),
      );
    }
    if (dashboard === pendingQueryDashboard) {
      fetchMock.post(
        `path:/api/dashboard/${dashboard.id}/dashcard/${dashcard.id}/card/${dashcard.card_id}/query`,
        pendingQuery.promise,
      );
    } else {
      setupDashcardQueryEndpoints(dashboard.id, dashcard, createMockDataset());
    }
  });

  const view = renderWithProviders(<DashboardPreview dashboard={SALES} />);
  const showDashboard = (dashboard: Dashboard) =>
    view.rerender(<DashboardPreview dashboard={dashboard} />);

  return { ...view, pendingMetadata, pendingQuery, showDashboard };
}

async function settle() {
  await act(() => fetchMock.callHistory.flush(true));
}

describe("DashboardPreview", () => {
  it("keeps showing the current dashboard when the previous one finishes loading later", async () => {
    const { pendingMetadata, showDashboard } = setup({
      pendingMetadataDashboard: SALES,
    });

    showDashboard(ORDERS);
    expect(await screen.findByText("Orders by state")).toBeInTheDocument();

    pendingMetadata.resolve(
      createMockDashboardQueryMetadata({ databases: [DATABASE] }),
    );
    await settle();

    expect(screen.getByText("Orders by state")).toBeInTheDocument();
    expect(screen.queryByText("Revenue by month")).not.toBeInTheDocument();
  });

  it("leaves no dashboard behind when it unmounts before the dashboard loads", async () => {
    const { pendingMetadata, store, unmount } = setup({
      pendingMetadataDashboard: SALES,
    });

    unmount();
    pendingMetadata.resolve(
      createMockDashboardQueryMetadata({ databases: [DATABASE] }),
    );
    await settle();

    expect(store.getState().dashboard.dashboardId).toBeNull();
  });

  it("follows a saved change to auto-apply filters", async () => {
    const { showDashboard, store } = setup();
    expect(await screen.findByText("Revenue by month")).toBeInTheDocument();
    expect(getIsAutoApplyFilters(store.getState())).toBe(true);

    showDashboard({ ...SALES, auto_apply_filters: false });

    await waitFor(() =>
      expect(getIsAutoApplyFilters(store.getState())).toBe(false),
    );
    expect(store.getState().dashboard.dashboardId).toBe(SALES.id);
  });

  it("drops the previous dashboard's card results when switching dashboards mid-load", async () => {
    const { pendingQuery, showDashboard, store } = setup({
      pendingQueryDashboard: SALES,
    });
    expect(await screen.findByText("Revenue by month")).toBeInTheDocument();

    showDashboard(ORDERS);
    expect(await screen.findByText("Orders by state")).toBeInTheDocument();
    pendingQuery.resolve(createMockDataset());
    await settle();

    expect(store.getState().dashboard.dashcardData).not.toHaveProperty(
      String(SALES.dashcards[0].id),
    );
  });
});

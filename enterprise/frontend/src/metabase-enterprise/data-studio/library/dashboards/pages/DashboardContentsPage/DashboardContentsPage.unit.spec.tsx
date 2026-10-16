import { setupDashboardEndpoints } from "__support__/server-mocks";
import { setupListSubscriptionsEndpoint } from "__support__/server-mocks/pulse";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import {
  DASHBOARDS_COLLECTION,
  ORDERS_QUESTION,
  SHARED_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../../../test-utils";

import { DashboardContentsPage } from "./DashboardContentsPage";

const DASHBOARD_ID = 10;

const DASHBOARD_QUESTION = createMockCard({
  id: 3,
  name: "Weekly signups",
  type: "question",
  dashboard_id: DASHBOARD_ID,
});

type SetupOpts = {
  cards?: Card[];
  dashboardSlug?: string;
};

function setup({
  cards = [],
  dashboardSlug = String(DASHBOARD_ID),
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 800 });
  setupListSubscriptionsEndpoint([]);
  setupDashboardEndpoints(
    createMockDashboard({
      id: DASHBOARD_ID,
      name: "Sales overview",
      collection_id: DASHBOARDS_COLLECTION.id,
      collection: DASHBOARDS_COLLECTION,
      dashcards: cards.map((card, index) =>
        createMockDashboardCard({ id: index + 1, card }),
      ),
    }),
  );
  setupLibraryCollectionEndpoints([SHARED_COLLECTION]);

  renderWithProviders(
    <Route
      path="/data-studio/dashboards/:dashboardId/contents"
      element={<DashboardContentsPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/dashboards/${dashboardSlug}/contents`,
    },
  );
}

describe("DashboardContentsPage", () => {
  it("shows a loader, then a row per dashboard card, placing dashboard questions in the dashboard", async () => {
    setup({ cards: [ORDERS_QUESTION, DASHBOARD_QUESTION] });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(
      await screen.findByTestId("dashboard-contents-page"),
    ).toBeInTheDocument();

    const ordersRow = screen.getByRole("row", { name: /Orders/ });
    expect(await within(ordersRow).findByText("Shared")).toBeInTheDocument();
    const signupsRow = screen.getByRole("row", { name: /Weekly signups/ });
    expect(within(signupsRow).getByText("Sales overview")).toBeInTheDocument();
  });

  it("tells the user when the dashboard has no questions", async () => {
    setup();

    expect(
      await screen.findByText("This dashboard has no questions yet"),
    ).toBeInTheDocument();
  });

  it("says the dashboard is not found when the URL has no dashboard id", async () => {
    setup({ dashboardSlug: "sales" });

    expect(await screen.findByText("Dashboard not found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Dashboards" }),
    ).toHaveAttribute("href", "/data-studio/dashboards");
    expect(
      screen.queryByTestId("dashboard-contents-page"),
    ).not.toBeInTheDocument();
  });
});

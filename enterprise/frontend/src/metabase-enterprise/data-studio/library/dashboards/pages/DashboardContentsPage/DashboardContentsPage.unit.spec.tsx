import userEvent from "@testing-library/user-event";

import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
} from "__support__/server-mocks";
import { setupListSubscriptionsEndpoint } from "__support__/server-mocks/pulse";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { Card, Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardContentsPage } from "./DashboardContentsPage";

const DASHBOARDS_COLLECTION = createMockCollection({
  id: 2,
  name: "Dashboards",
  type: "library-dashboards",
});

const SALES_COLLECTION = createMockCollection({ id: 3, name: "Sales" });

const METRICS_COLLECTION = createMockCollection({
  id: 4,
  name: "Metrics",
  type: "library-metrics",
});

const DASHBOARD_ID = 10;

const ORDERS = createMockCard({
  id: 1,
  name: "Orders",
  type: "question",
  collection_id: SALES_COLLECTION.id,
});

const REVENUE = createMockCard({
  id: 2,
  name: "Revenue",
  type: "metric",
  collection_id: SALES_COLLECTION.id,
});

const LIBRARY_METRIC = createMockCard({
  id: 4,
  name: "Churn rate",
  type: "metric",
  collection_id: METRICS_COLLECTION.id,
});

const DASHBOARD_QUESTION = createMockCard({
  id: 3,
  name: "Weekly signups",
  type: "question",
  dashboard_id: DASHBOARD_ID,
});

type SetupOpts = {
  dashboard?: Dashboard;
  dashboardSlug?: string;
  isNotFound?: boolean;
};

function setup({
  dashboard = createMockDashboard({ id: DASHBOARD_ID }),
  dashboardSlug = String(dashboard.id),
  isNotFound = false,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 800 });
  setupListSubscriptionsEndpoint([]);
  if (isNotFound) {
    setupDashboardNotFoundEndpoint(dashboard);
  } else {
    setupDashboardEndpoints(dashboard);
  }
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection(ROOT_COLLECTION),
      DASHBOARDS_COLLECTION,
      SALES_COLLECTION,
      METRICS_COLLECTION,
    ],
  });

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

function createDashboardWithCards(cards: Card[]) {
  return createMockDashboard({
    id: DASHBOARD_ID,
    name: "Sales overview",
    collection_id: DASHBOARDS_COLLECTION.id,
    dashcards: cards.map((card, index) =>
      createMockDashboardCard({ id: index + 1, card }),
    ),
  });
}

describe("DashboardContentsPage", () => {
  it("shows a loader, then a row per card with its type and location", async () => {
    setup({
      dashboard: createDashboardWithCards([
        ORDERS,
        REVENUE,
        DASHBOARD_QUESTION,
      ]),
    });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(
      await screen.findByTestId("dashboard-contents-page"),
    ).toBeInTheDocument();

    const ordersRow = screen.getByRole("row", { name: /Orders/ });
    expect(within(ordersRow).getByText("Question")).toBeInTheDocument();
    expect(await within(ordersRow).findByText("Sales")).toBeInTheDocument();

    const revenueRow = screen.getByRole("row", { name: /Revenue/ });
    expect(within(revenueRow).getByText("Metric")).toBeInTheDocument();
    expect(await within(revenueRow).findByText("Sales")).toBeInTheDocument();

    const signupsRow = screen.getByRole("row", { name: /Weekly signups/ });
    expect(within(signupsRow).getByText("Question")).toBeInTheDocument();
    expect(within(signupsRow).getByText("Sales overview")).toBeInTheDocument();
  });

  it("links only metrics saved in the Library to Data Studio", async () => {
    setup({
      dashboard: createDashboardWithCards([ORDERS, REVENUE, LIBRARY_METRIC]),
    });

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Churn rate/ })).toHaveAttribute(
        "href",
        "/data-studio/library/metrics/4",
      ),
    );
    expect(screen.getByRole("link", { name: /Revenue/ })).toHaveAttribute(
      "href",
      "/metric/2-revenue",
    );
    expect(screen.getByRole("link", { name: /Orders/ })).toHaveAttribute(
      "href",
      "/question/1-orders",
    );
  });

  it("filters the cards by name and reports when nothing matches", async () => {
    setup({ dashboard: createDashboardWithCards([ORDERS, REVENUE]) });
    const searchInput = await screen.findByPlaceholderText("Search...");

    await userEvent.type(searchInput, "rev");
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "churn");
    expect(screen.getByText('No results for "churn"')).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
  });

  it("tells the user when the dashboard has no questions", async () => {
    setup({ dashboard: createDashboardWithCards([]) });

    expect(
      await screen.findByText("This dashboard has no questions yet"),
    ).toBeInTheDocument();
  });

  it("shows the trash banner when the dashboard is archived", async () => {
    setup({
      dashboard: createMockDashboard({ id: DASHBOARD_ID, archived: true }),
    });

    expect(await screen.findByTestId("archive-banner")).toHaveTextContent(
      "This dashboard is in the trash.",
    );
  });

  it("shows an error when the dashboard cannot be loaded", async () => {
    setup({ isNotFound: true });

    await waitForLoaderToBeRemoved();
    expect(
      screen.queryByTestId("dashboard-contents-page"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });

  it("says the dashboard is not found when the URL has no dashboard id", async () => {
    setup({ dashboardSlug: "sales" });

    expect(await screen.findByText("Dashboard not found.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-contents-page"),
    ).not.toBeInTheDocument();
  });
});

import fetchMock from "fetch-mock";

import {
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { defer } from "metabase/utils/promise";
import type { Dashboard, DashboardId } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";

import { HomePage } from "./HomePage";

const TEST_USER_NAME = "Testy";
const TEST_DASHBOARD_NAME = "Dashboard";

const TestDashboard = () => <div>{TEST_DASHBOARD_NAME}</div>;

interface SetupOpts {
  dashboardId?: DashboardId;
  dashboardResponse?: () => Promise<Dashboard>;
}

const setup = async ({ dashboardId, dashboardResponse }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({
      first_name: TEST_USER_NAME,
      custom_homepage: dashboardId ? { dashboard_id: dashboardId } : null,
    }),
  });

  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupPopularItemsEndpoints([]);
  if (dashboardId !== undefined) {
    setupDashboardEndpoints(createMockDashboard({ id: dashboardId }), {
      dashboardResponse,
    });
  }

  renderWithProviders(
    <>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard/:slug" element={<TestDashboard />} />
    </>,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
};

describe("HomePage", () => {
  it("should not load metabot-related data when it is disabled", () => {
    setup();
    expect(screen.getByText(new RegExp(TEST_USER_NAME))).toBeInTheDocument();
  });

  it("should redirect you to a dashboard when one has been defined to be used as a homepage", async () => {
    setup({ dashboardId: 1 });
    expect(await screen.findByText(TEST_DASHBOARD_NAME)).toBeInTheDocument();
  });

  it("should show a loader instead of the homepage until the homepage dashboard loads (metabase#37089)", async () => {
    const dashboardRequest = defer<Dashboard>();
    setup({
      dashboardId: 10,
      dashboardResponse: () => dashboardRequest.promise,
    });

    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/dashboard/10")).toBe(true),
    );
    const loadingHeading = screen.queryByRole("heading", {
      name: "Loading...",
    });
    const homePage = screen.queryByTestId("home-page");
    dashboardRequest.resolve(createMockDashboard({ id: 10, archived: false }));
    expect(loadingHeading).toBeInTheDocument();
    expect(homePage).not.toBeInTheDocument();

    expect(await screen.findByText(TEST_DASHBOARD_NAME)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Loading..." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("home-page")).not.toBeInTheDocument();
  });

  it("should show the homepage right away when no homepage dashboard is set (metabase#37089)", () => {
    setup();
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  it("should render the homepage when a custom dashboard is not set", () => {
    setup();
    expect(screen.queryByText(TEST_DASHBOARD_NAME)).not.toBeInTheDocument();
  });
});

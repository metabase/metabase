import { Route } from "react-router";

import {
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { DashboardId } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { HomePage } from "./HomePage";

const TEST_USER_NAME = "Testy";
const TEST_DASHBOARD_NAME = "Dashboard";

const TestDashboard = () => <div>{TEST_DASHBOARD_NAME}</div>;

interface SetupOpts {
  dashboardId?: DashboardId;
}

const setup = async ({ dashboardId }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({
      first_name: TEST_USER_NAME,
      custom_homepage: dashboardId ? { dashboard_id: dashboardId } : null,
    }),
    settings: createMockSettingsState({
      "is-metabot-enabled": false,
    }),
  });

  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupPopularItemsEndpoints([]);
  if (dashboardId !== undefined) {
    setupDashboardEndpoints(createMockDashboard({ id: dashboardId }));
  }

  renderWithProviders(
    <>
      <Route path="/" component={HomePage} />
      <Route path="/dashboard/:slug" component={TestDashboard} />
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

  it("should render the homepage when a custom dashboard is not set", () => {
    setup();
    expect(screen.queryByText(TEST_DASHBOARD_NAME)).not.toBeInTheDocument();
  });
});

import { Route } from "react-router";
import { DashboardId } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { HomePage } from "./HomePage";

const TEST_DASHBOARD_NAME = "Dashboard";

const TestDashboard = () => <div>{TEST_DASHBOARD_NAME}</div>;

interface SetupOpts {
  dashboardId?: DashboardId;
}

const setup = async ({ dashboardId }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({
      custom_homepage: dashboardId ? { dashboard_id: dashboardId } : null,
    }),
  });

  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupPopularItemsEndpoints([]);

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

  await waitFor(() => {
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  });
};

describe("HomePage", () => {
  it("should redirect you to a dashboard when one has been defined to be used as a homepage", async () => {
    await setup({ dashboardId: 1 });
    expect(screen.getByText(TEST_DASHBOARD_NAME)).toBeInTheDocument();
  });

  it("should render the homepage when a custom dashboard is not set", async () => {
    await setup();
    expect(screen.queryByText(TEST_DASHBOARD_NAME)).not.toBeInTheDocument();
  });
});

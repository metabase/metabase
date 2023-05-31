import { Route } from "react-router";
import { DashboardId } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import { HomePage } from "./HomePage";

const TEST_USER_NAME = "Testy";
const TEST_DASHBOARD_NAME = "Dashboard";

const TestDashboard = () => <div>{TEST_DASHBOARD_NAME}</div>;

interface SetupOpts {
  dashboardId?: DashboardId;
}

const setup = ({ dashboardId }: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({
      first_name: TEST_USER_NAME,
      custom_homepage: dashboardId ? { dashboard_id: dashboardId } : null,
    }),
  });

  setupDatabasesEndpoints([]);
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
};

describe("HomePage", () => {
  it("should redirect you to a dashboard when one has been defined to be used as a homepage", async () => {
    setup({ dashboardId: 1 });
    expect(await screen.findByText(TEST_DASHBOARD_NAME)).toBeInTheDocument();
    expect(screen.queryByText(TEST_USER_NAME)).not.toBeInTheDocument();
  });

  it("should render the homepage when a custom dashboard is not set", async () => {
    setup();
    expect(await screen.findByText(TEST_USER_NAME)).toBeInTheDocument();
    expect(screen.queryByText(TEST_DASHBOARD_NAME)).not.toBeInTheDocument();
  });
});

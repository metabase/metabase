import { Route, Router } from "react-router";
import fetchMock from "fetch-mock";
import DashboardApp from "metabase/dashboard/containers/DashboardApp";

import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { renderWithProviders, screen } from "__support__/ui";
import HomePageApp from "./HomePageApp";

const LayoutMock = () => <div>Content</div>;
jest.mock("../../components/HomeLayout", () => LayoutMock);

const DashboardMock = () => <div>Dashboard</div>;
jest.mock("metabase/dashboard/containers/DashboardApp", () => DashboardMock);

const setupForRedirect = ({ customDashboardSet = true } = {}) => {
  const dashboard = createMockDashboard();

  fetchMock.get("path:/api/dashboard/1", dashboard);
  fetchMock.get("path:/api/database", []);
  fetchMock.get("path:/api/search", []);

  renderWithProviders(
    <Router>
      <Route path="/" component={HomePageApp} />
      <Route path="/dashboard/:slug" component={DashboardApp} />
    </Router>,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({
          custom_homepage: customDashboardSet
            ? {
                dashboard_id: 1,
              }
            : null,
        }),
      }),
    },
  );
};

it("should redirect you to a dashboard when one has been defined to be used as a homepage", async () => {
  setupForRedirect();
  expect(await screen.findByText("Dashboard")).toBeInTheDocument();
});

it("should render homepage when custom-homepage is false", async () => {
  setupForRedirect({
    customDashboardSet: false,
  });
  expect(await screen.findByText("Content")).toBeInTheDocument();
});

import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupAutoDashboardEndpoints,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { AutomaticDashboardApp } from "./AutomaticDashboardApp";

const TEST_DATABASE_WITH_ACTIONS = createMockDatabase({
  settings: { "database-enable-actions": true },
});

const setup = async () => {
  const mockDashboard = createMockDashboard();
  const dashboardId = mockDashboard.id;

  setupAutoDashboardEndpoints(
    mockDashboard,
    createMockDashboardQueryMetadata({
      databases: [TEST_DATABASE_WITH_ACTIONS],
    }),
  );
  setupDatabaseListEndpoint([TEST_DATABASE_WITH_ACTIONS]);

  renderWithProviders(
    <Route path="/auto/dashboard/*" component={AutomaticDashboardApp} />,
    {
      withRouter: true,
      initialRoute: `/auto/dashboard/table/${dashboardId}`,
      storeInitialState: {
        dashboard: createMockDashboardState({ dashboardId }),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE_WITH_ACTIONS],
        }),
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    dashboardId,
  };
};

describe("AutomaticDashboardApp", () => {
  it("Shows 'See it' link next to Save button when dashboard is saved", async () => {
    const { dashboardId } = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Save this" }));
    const savedButton = await screen.findByRole("button", { name: "Saved" });
    expect(savedButton).toBeDisabled();
    const seeItLink = within(
      screen.getByTestId("automatic-dashboard-header"),
    ).getByRole("link", { name: "See it" });
    expect(seeItLink).toHaveAttribute(
      "href",
      `/dashboard/${dashboardId}-dashboard`,
    );
  });
});

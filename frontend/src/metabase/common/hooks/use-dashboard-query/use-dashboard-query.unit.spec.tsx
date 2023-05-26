import React from "react";
import { createMockDashboard } from "metabase-types/api/mocks";
import { setupDashboardEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { useDashboardQuery } from "./use-dashboard-query";

const TEST_DASHBOARD = createMockDashboard();

const TestComponent = () => {
  const { data, isLoading, error } = useDashboardQuery({
    id: TEST_DASHBOARD.id,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  } else if (error) {
    return <div>Error</div>;
  } else {
    return <div>{data?.name}</div>;
  }
};

const setup = () => {
  setupDashboardEndpoints(TEST_DASHBOARD);
  renderWithProviders(<TestComponent />);
};

describe("useDatabaseQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText(TEST_DASHBOARD.name)).toBeInTheDocument();
  });
  it("should return an error when it can't find a dashboard", async () => {
    renderWithProviders(<TestComponent />);
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});

import React from "react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
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

  if (isLoading || error || !data) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data.name}</div>;
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
});

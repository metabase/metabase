import {
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { createMockDashboard } from "metabase-types/api/mocks";

import { useDashboardQuery } from "./use-dashboard-query";

const TEST_DASHBOARD = createMockDashboard();

const TestComponent = () => {
  const { data, isLoading, error } = useDashboardQuery({
    id: TEST_DASHBOARD.id,
  });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <div>{data?.name}</div>;
};

const setup = () => {
  setupDashboardEndpoints(TEST_DASHBOARD);
  renderWithProviders(<TestComponent />);
};

describe("useDashboardQuery", () => {
  it("should be initially loading", () => {
    setup();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_DASHBOARD.name)).toBeInTheDocument();
  });

  it("should return an error when it can't find a dashboard", async () => {
    setupDashboardNotFoundEndpoint(TEST_DASHBOARD);
    renderWithProviders(<TestComponent />);
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });
});

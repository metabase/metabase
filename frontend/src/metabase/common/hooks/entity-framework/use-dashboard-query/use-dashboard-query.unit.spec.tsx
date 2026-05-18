import {
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
} from "__support__/server-mocks/dashboard";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui-with-store";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("should show data from the response", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText(TEST_DASHBOARD.name)).toBeInTheDocument();
  });

  it("should return an error when it can't find a dashboard", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    setupDashboardNotFoundEndpoint(TEST_DASHBOARD);
    renderWithProviders(<TestComponent />);
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Request entities,dashboards,1,fetch failed:",
      expect.any(Object),
    );
    consoleErrorSpy.mockRestore();
  });
});

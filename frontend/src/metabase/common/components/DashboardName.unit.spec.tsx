import fetchMock from "fetch-mock";

import {
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";

import { DashboardName } from "./DashboardName";

const TEST_DASHBOARD = createMockDashboard({ name: "Sales overview" });

const renderName = (id: Parameters<typeof DashboardName>[0]["id"]) =>
  renderWithProviders(
    <div data-testid="wrapper">
      <DashboardName id={id} />
    </div>,
  );

describe("DashboardName", () => {
  it("renders the dashboard name returned from the API", async () => {
    setupDashboardEndpoints(TEST_DASHBOARD);

    renderName(TEST_DASHBOARD.id);

    expect(await screen.findByText("Sales overview")).toBeInTheDocument();
  });

  it("renders nothing while the dashboard is loading", () => {
    setupDashboardEndpoints(TEST_DASHBOARD);

    renderName(TEST_DASHBOARD.id);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the dashboard cannot be found", async () => {
    setupDashboardNotFoundEndpoint(TEST_DASHBOARD);

    renderName(TEST_DASHBOARD.id);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/dashboard/${TEST_DASHBOARD.id}`),
      ).toHaveLength(1);
    });
    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the id is null", () => {
    renderName(null);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the id is undefined", () => {
    renderName(undefined);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the id is NaN", () => {
    renderName(NaN);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });
});

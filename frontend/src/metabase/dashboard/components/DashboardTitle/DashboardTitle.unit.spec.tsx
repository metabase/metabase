import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
} from "metabase-types/api/mocks";

import { DashboardTitle } from "./DashboardTitle";

const DASHBOARD = createMockDashboard({
  id: 10,
  name: "Orders in a dashboard",
  dashcards: [],
  can_write: true,
});

const setup = () => {
  setupDashboardEndpoints(DASHBOARD);
  setupDashboardQueryMetadataEndpoint(
    DASHBOARD,
    createMockDashboardQueryMetadata(),
  );

  renderWithProviders(
    <MockDashboardContext isEditableDashboard isEditing={false}>
      <DashboardTitle />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD.id,
          dashboards: {
            [DASHBOARD.id]: createMockStoreDashboard({
              ...DASHBOARD,
              dashcards: [],
              tabs: [],
            }),
          },
        }),
      },
    },
  );
};

describe("DashboardTitle", () => {
  it("saves a new name when the title loses focus", async () => {
    setup();

    const title = screen.getByTestId("dashboard-name-heading");
    await userEvent.type(title, " 2");
    await userEvent.tab();

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(`path:/api/dashboard/${DASHBOARD.id}`, {
          method: "PUT",
        }),
      ).toHaveLength(1),
    );
    const [putCall] = fetchMock.callHistory.calls(
      `path:/api/dashboard/${DASHBOARD.id}`,
      { method: "PUT" },
    );
    const body: unknown = JSON.parse(String(putCall.options.body));
    expect(body).toEqual({ name: "Orders in a dashboard 2" });
  });
});

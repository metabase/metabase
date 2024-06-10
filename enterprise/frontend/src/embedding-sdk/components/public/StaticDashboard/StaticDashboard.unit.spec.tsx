import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { StaticDashboard } from "./StaticDashboard";

const TEST_DASHBOARD_ID = 1;

const setup = () => {
  const database = createSampleDatabase();

  const dashboard = createMockDashboard({
    id: TEST_DASHBOARD_ID,
  });

  setupDashboardEndpoints(dashboard);

  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [database],
    }),
  );

  const user = createMockUser();

  const state = setupSdkState({
    currentUser: user,
    dashboard: createMockDashboardState({
      dashboards: {
        [dashboard.id]: { ...dashboard, dashcards: [] },
      },
      dashboardId: dashboard.id,
    }),
  });

  renderWithProviders(<StaticDashboard dashboardId={TEST_DASHBOARD_ID} />, {
    mode: "sdk",
    sdkConfig: createMockConfig({
      jwtProviderUri: "http://TEST_URI/sso/metabase",
    }),
    storeInitialState: state,
  });
};

describe("StaticDashboard", () => {
  it("should render", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect("Hello Poom!").toEqual("Hello Poom!");
  });
});

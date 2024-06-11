import { Box } from "@mantine/core";
import { indexBy } from "underscore";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  screen,
  renderWithProviders,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockStructuredDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { StaticDashboard, type StaticDashboardProps } from "./StaticDashboard";

const TEST_DASHBOARD_ID = 1;

interface SetupOptions {
  props?: Partial<StaticDashboardProps>;
}

const setup = (options: SetupOptions = {}) => {
  const { props } = options;

  const database = createSampleDatabase();

  const dataset_query = createMockStructuredDatasetQuery({
    query: { "source-table": ORDERS_ID },
  });

  const tableCard = createMockCard({
    id: 1,
    dataset_query,
    name: "Here is a card title",
  });

  const tableDashcard = createMockDashboardCard({
    id: 1,
    card_id: tableCard.id,
    card: tableCard,
  });

  const dashcards = [tableDashcard];

  const dashboard = createMockDashboard({
    id: TEST_DASHBOARD_ID,
    dashcards,
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
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: dashcards.map(dc => dc.id),
        },
      },
      dashcards: indexBy(dashcards, "id"),
    }),
  });

  renderWithProviders(
    <Box h="500px">
      <StaticDashboard dashboardId={TEST_DASHBOARD_ID} {...props} />
    </Box>,
    {
      mode: "sdk",
      sdkConfig: createMockConfig({
        jwtProviderUri: "http://TEST_URI/sso/metabase",
      }),
      storeInitialState: state,
    },
  );
};

describe("StaticDashboard", () => {
  it("should render", async () => {
    setup();
    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    // Dashboard card's question title should be in here.
    expect(await screen.findByText("Here is a card title")).toBeInTheDocument();

    // loading spinner should be in here
    // you should see `data-testid="loading-spinner"` there
    // screen.debug();

    // Loader does not go away! Test will fail here.
    await waitForLoaderToBeRemoved();
  });
});

import { Box } from "@mantine/core";
import { indexBy } from "underscore";

import {
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockStructuredDatasetQuery,
  createMockTextDashboardCard,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { InteractiveDashboard } from "./InteractiveDashboard";

const TEST_DASHBOARD_ID = 1;

const setup = () => {
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

  const textDashcard = createMockTextDashboardCard({
    id: 2,
    text: "Some card text",
  });

  const dashcards = [tableDashcard, textDashcard];

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
      <InteractiveDashboard dashboardId={TEST_DASHBOARD_ID} />
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

describe("InteractiveDashboard", () => {
  it("shows dashboard cards", async () => {
    setup();
    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
    expect(await screen.findByText("Here is a card title")).toBeInTheDocument();
    expect(await screen.findByText("Some card text")).toBeInTheDocument();
  });
});

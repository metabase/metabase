import { indexBy } from "underscore";

import {
  setupAlertsEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { screen } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk/test/__support__/ui";
import { createMockAuthProviderUriConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import { Box } from "metabase/ui";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDatabase,
  createMockDataset,
  createMockParameter,
  createMockStructuredDatasetQuery,
  createMockTextDashboardCard,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockDashboardState } from "metabase-types/store/mocks";

import type { MetabaseProviderProps } from "../../MetabaseProvider";
import { SdkDashboard, type SdkDashboardProps } from "../SdkDashboard";

export const TEST_DASHBOARD_ID = 1;
const TEST_DB = createMockDatabase({ id: 1 });
const TEST_COLLECTION = createMockCollection();

const dataset_query = createMockStructuredDatasetQuery({
  query: { "source-table": ORDERS_ID },
});

const dashboardTabs = [
  createMockDashboardTab({ id: 1, name: "Foo Tab 1" }),
  createMockDashboardTab({ id: 2, name: "Foo Tab 2" }),
];

const tableCard = createMockCard({
  id: 1,
  dataset_query,
  name: "Here is a card title",
});

const parameter = createMockParameter({
  id: "1",
  type: "string/contains",
  slug: "title",
  name: "Title",
});

const tableDashcard = createMockDashboardCard({
  id: 1,
  card_id: tableCard.id,
  card: tableCard,
  dashboard_tab_id: dashboardTabs[0].id,
  parameter_mappings: [
    {
      card_id: tableCard.id,
      parameter_id: parameter.id,
      target: [
        "dimension",
        ["field", parameter.slug, { "base-type": "type/Text" }],
      ],
    },
  ],
});

const textDashcard = createMockTextDashboardCard({
  id: 2,
  text: "Some card text",
  dashboard_tab_id: dashboardTabs[0].id,
});

const textDashcard2 = createMockTextDashboardCard({
  id: 3,
  text: "Some card text",
  dashboard_tab_id: dashboardTabs[1].id,
});

const dashcards = [tableDashcard, textDashcard, textDashcard2];

export const setup = async ({
  props,
  providerProps,
}: {
  props?: Partial<SdkDashboardProps>;
  providerProps?: Partial<MetabaseProviderProps>;
} = {}) => {
  const database = createSampleDatabase();

  const dashboardId = props?.dashboardId || TEST_DASHBOARD_ID;
  const dashboard = createMockDashboard({
    id: dashboardId,
    dashcards,
    tabs: dashboardTabs,
    parameters: [parameter],
  });

  setupDashboardEndpoints(dashboard);

  setupCollectionsEndpoints({ collections: [] });
  setupCollectionItemsEndpoint({
    collection: TEST_COLLECTION,
    collectionItems: [],
  });

  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({
      databases: [database],
    }),
  );

  setupCardEndpoints(tableCard);
  setupCardQueryEndpoints(tableCard, createMockDataset());
  setupCardQueryMetadataEndpoint(
    tableCard,
    createMockCardQueryMetadata({
      databases: [TEST_DB],
    }),
  );

  setupDashcardQueryEndpoints(dashboardId, tableDashcard, createMockDataset());

  setupAlertsEndpoints(tableCard, []);

  setupNotificationChannelsEndpoints({});

  setupDatabasesEndpoints([createMockDatabase()]);

  setupLastDownloadFormatEndpoints();

  const user = createMockUser();

  const state = setupSdkState({
    currentUser: user,
    dashboard: createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: dashcards.map((dc) => dc.id),
        },
      },
      dashcards: indexBy(dashcards, "id"),
    }),
  });

  renderWithSDKProviders(
    <Box h="500px">
      <SdkDashboard dashboardId={dashboardId} {...props} />
    </Box>,
    {
      sdkProviderProps: {
        ...providerProps,
        authConfig: createMockAuthProviderUriConfig({
          authProviderUri: "http://TEST_URI/sso/metabase",
        }),
      },
      storeInitialState: state,
    },
  );

  expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

  return {
    dashboard,
  };
};

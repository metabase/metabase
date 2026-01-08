import { indexBy } from "underscore";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { screen } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Box } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";
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

import type { EditableDashboardProps } from "../EditableDashboard";
import type { SdkDashboardProps } from "../SdkDashboard";

export const TEST_DASHBOARD_ID = 1;
export const TEST_DB = createMockDatabase({ id: 1 });
export const TEST_COLLECTION = createMockCollection();

const dataset_query = createMockStructuredDatasetQuery({
  query: { "source-table": ORDERS_ID },
});

export const dashboardTabs = [
  createMockDashboardTab({ id: 1, name: "Foo Tab 1" }),
  createMockDashboardTab({ id: 2, name: "Foo Tab 2" }),
];

export const tableCard = createMockCard({
  id: 1,
  dataset_query,
  name: "Here is a card title",
});

export const parameter = createMockParameter({
  id: "1",
  type: "string/contains",
  slug: "title",
  name: "Title",
});

export const tableDashcard = createMockDashboardCard({
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

export const textDashcard = createMockTextDashboardCard({
  id: 2,
  text: "Some card text",
  dashboard_tab_id: dashboardTabs[0].id,
});

export const textDashcard2 = createMockTextDashboardCard({
  id: 3,
  text: "Some card text",
  dashboard_tab_id: dashboardTabs[1].id,
});

export const DEFAULT_DASHCARDS: DashboardCard[] = [
  tableDashcard,
  textDashcard,
  textDashcard2,
];

export interface SetupSdkDashboardOptions {
  props?: Partial<SdkDashboardProps>;
  providerProps?: Partial<MetabaseProviderProps>;
  isLocaleLoading?: boolean;
  component: React.ComponentType<SdkDashboardProps>;
  dashboardName?: string;
  dataPickerProps?: EditableDashboardProps["dataPickerProps"];
  dashcards?: DashboardCard[];
  hasEmbeddingEnterprisePlugin?: boolean;
}

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

export const setupSdkDashboard = async ({
  props = {},
  providerProps = {},
  isLocaleLoading = false,
  component: Component,
  dashboardName = "Dashboard",
  dataPickerProps,
  dashcards = DEFAULT_DASHCARDS,
  hasEmbeddingEnterprisePlugin = false,
}: SetupSdkDashboardOptions) => {
  const useLocaleMock = useLocale as jest.Mock;
  useLocaleMock.mockReturnValue({ isLocaleLoading });

  const database = createSampleDatabase();

  const dashboardId = props?.dashboardId || TEST_DASHBOARD_ID;
  const dashboard = createMockDashboard({
    id: dashboardId,
    name: dashboardName,
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

  setupBookmarksEndpoints([]);

  const BOBBY_TEST_COLLECTION = createMockCollection({
    archived: false,
    can_write: true,
    description: null,
    id: 1,
    location: "/",
    name: "Bobby Tables's Personal Collection",
    personal_owner_id: 100,
  });

  setupCollectionByIdEndpoint({
    collections: [BOBBY_TEST_COLLECTION],
  });

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

  if (hasEmbeddingEnterprisePlugin) {
    setupEnterpriseOnlyPlugin("embedding");
  }

  renderWithSDKProviders(
    <Box h="500px">
      <Component
        dashboardId={dashboardId}
        dataPickerProps={dataPickerProps}
        {...props}
      />
    </Box>,
    {
      componentProviderProps: {
        ...providerProps,
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: state,
    },
  );

  if (!isLocaleLoading) {
    if (dashcards.length === 0) {
      // For empty dashboards, wait for the empty state instead of the grid
      expect(
        await screen.findByTestId("dashboard-empty-state"),
      ).toBeInTheDocument();
    } else {
      expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
    }
  }

  return {
    dashboard,
  };
};

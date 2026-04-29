import type { ComponentType } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  createDashboardReduxState,
  setupDashboardScenario,
  setupNotificationChannelsScenario,
  setupSavedCardScenario,
} from "__support__/scenarios";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { screen } from "__support__/ui";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { useLocale } from "metabase/common/hooks/use-locale";
import { Box } from "metabase/ui";
import type { DashboardCard, TokenFeatures } from "metabase-types/api";
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
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

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

export interface SetupSdkDashboardOptions extends NotificationChannelSetup {
  props?: Omit<Partial<SdkDashboardProps>, "token">;
  providerProps?: Partial<MetabaseProviderProps>;
  isLocaleLoading?: boolean;
  component: ComponentType<SdkDashboardProps>;
  dashboardName?: string;
  dataPickerProps?: EditableDashboardProps["dataPickerProps"];
  dashcards?: DashboardCard[];
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  tokenFeatures?: Partial<TokenFeatures>;
}

interface NotificationChannelSetup {
  isEmailConfigured?: boolean;
  isSlackConfigured?: boolean;
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
  enterprisePlugins = [],
  tokenFeatures = {},
  isEmailConfigured = false,
  isSlackConfigured = false,
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

  setupDashboardScenario({
    dashboard,
    metadata: createMockDashboardQueryMetadata({
      databases: [database],
    }),
  });

  setupCollectionsEndpoints({ collections: [] });
  setupCollectionItemsEndpoint({
    collection: TEST_COLLECTION,
    collectionItems: [],
  });

  setupSavedCardScenario({
    card: tableCard,
    dataset: createMockDataset(),
    metadata: createMockCardQueryMetadata({ databases: [TEST_DB] }),
  });

  setupDashcardQueryEndpoints(dashboardId, tableDashcard, createMockDataset());

  setupNotificationChannelsScenario({
    email: isEmailConfigured,
    slack: isSlackConfigured,
  });

  setupDatabasesEndpoints([createMockDatabase()]);

  setupLastDownloadFormatEndpoints();

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

  const user = createMockUser({
    permissions: createMockUserPermissions({
      can_create_queries: true,
    }),
  });

  const state = setupSdkState({
    currentUser: user,
    dashboard: createDashboardReduxState({ ...dashboard, dashcards }),
    tokenFeatures,
  });

  if (enterprisePlugins.length > 0) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithSDKProviders(
    <Box h="500px">
      <SdkInternalNavigationProvider>
        <Component
          dashboardId={dashboardId}
          dataPickerProps={dataPickerProps}
          {...props}
        />
      </SdkInternalNavigationProvider>
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

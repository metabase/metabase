import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { getDefaultTab } from "metabase/dashboard/actions";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { DashboardHeader, type DashboardHeaderProps } from "../DashboardHeader";

const DASHCARD = createMockDashboardCard();

export const TEST_DASHBOARD = createMockDashboard({
  dashcards: [DASHCARD],
});

export const TEST_DASHBOARD_WITH_TABS = createMockDashboard({
  tabs: [
    getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" }),
    getDefaultTab({
      tabId: 2,
      dashId: 1,
      name: "Tab 2",
    }),
  ],
});

export const setup = async ({
  dashboard = TEST_DASHBOARD,
  isAdmin = false,
  email = false,
  slack = false,
  collections = [],
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}) => {
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });
  setupBookmarksEndpoints([]);

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const channelData: {
    channels: {
      email?: any;
      slack?: any;
    };
  } = { channels: {} };

  if (email) {
    channelData.channels.email = {
      type: "email",
      name: "Email",
      allows_recipients: true,
      recipients: ["user", "email"],
      schedules: ["hourly"],
      configured: true,
    };
  }

  if (slack) {
    channelData.channels.slack = {
      type: "slack",
      name: "Slack",
      allows_recipients: false,
      schedules: ["hourly"],
      configured: true,
      fields: [
        {
          name: "channel",
          type: "select",
          displayName: "Post to",
          options: ["#general", "#random", "#alerts"],
          required: true,
        },
      ],
    };
  }

  setupNotificationChannelsEndpoints(channelData.channels);

  const dashboardHeaderProps: DashboardHeaderProps = {
    dashboard,
    isFullscreen: false,
    isNightMode: false,
    hasNightModeToggle: false,
    isAdditionalInfoVisible: false,
    refreshPeriod: 0,
    setRefreshElapsedHook: jest.fn(),
    onRefreshPeriodChange: jest.fn(),
    onNightModeChange: jest.fn(),
    onFullscreenChange: jest.fn(),
    parameterQueryParams: {},
  };

  renderWithProviders(
    <Route
      path="*"
      component={() => <DashboardHeader {...dashboardHeaderProps} />}
    ></Route>,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser({
          is_superuser: isAdmin,
        }),
        settings,
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: {
              ...dashboard,
              dashcards: dashboard.dashcards.map(c => c.id),
            },
          },
          dashcards: {
            [DASHCARD.id]: {
              ...DASHCARD,
              isDirty: false,
              isRemoved: false,
            },
          },
        }),
      },
    },
  );

  await waitForLoaderToBeRemoved();
};

import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { getDefaultTab } from "metabase/dashboard/actions";
import { DASHBOARD_APP_ACTIONS } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { Collection, TokenFeatures } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { DashboardHeader } from "../DashboardHeader";

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
  enterprisePlugins,
  tokenFeatures = {},
}: {
  dashboard?: typeof TEST_DASHBOARD;
  isAdmin?: boolean;
  email?: boolean;
  slack?: boolean;
  collections?: Collection[];
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
}) => {
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });
  setupBookmarksEndpoints([]);

  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
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

  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <MockDashboardContext
          dashboardId={dashboard.id}
          dashboard={dashboard}
          isFullscreen={false}
          isAdditionalInfoVisible={false}
          refreshPeriod={0}
          setRefreshElapsedHook={jest.fn()}
          onRefreshPeriodChange={jest.fn()}
          onFullscreenChange={jest.fn()}
          parameterQueryParams={{}}
          dashboardActions={DASHBOARD_APP_ACTIONS}
        >
          <DashboardHeader />
        </MockDashboardContext>
      )}
    />,
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
              dashcards: dashboard.dashcards.map((c) => c.id),
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

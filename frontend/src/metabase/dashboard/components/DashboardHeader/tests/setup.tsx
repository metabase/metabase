import fetchMock from "fetch-mock";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockDashboard,
  createMockDashboardOrderedCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  setupBookmarksEndpoints,
  setupCollectionsEndpoints,
  setupCollectionByIdEndpoint,
} from "__support__/server-mocks";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockDashboardState } from "metabase-types/store/mocks";
import { getDefaultTab } from "metabase/dashboard/actions";
import { mockSettings } from "__support__/settings";
import { DashboardHeader } from "../DashboardHeader";

const DASHCARD = createMockDashboardOrderedCard();

export const TEST_DASHBOARD = createMockDashboard({
  ordered_cards: [DASHCARD],
});

export const TEST_DASHBOARD_WITH_TABS = createMockDashboard({
  ordered_tabs: [
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

  fetchMock.get("path:/api/pulse/form_input", channelData);

  const dashboardHeaderProps = {
    isAdmin,
    dashboard,
    canManageSubscriptions: true,
    isEditing: false,
    isFullscreen: false,
    isNavBarOpen: false,
    isNightMode: false,
    isAdditionalInfoVisible: false,
    refreshPeriod: 0,
    addMarkdownDashCardToDashboard: jest.fn(),
    addHeadingDashCardToDashboard: jest.fn(),
    setRefreshElapsedHook: jest.fn(),
    addCardToDashboard: jest.fn(),
    addLinkDashCardToDashboard: jest.fn(),
    fetchDashboard: jest.fn(),
    updateDashboardAndCards: jest.fn(),
    setDashboardAttribute: jest.fn(),
    onEditingChange: jest.fn(),
    onRefreshPeriodChange: jest.fn(),
    onNightModeChange: jest.fn(),
    onFullscreenChange: jest.fn(),
    onSharingClick: jest.fn(),
    onChangeLocation: jest.fn(),
    toggleSidebar: jest.fn(),
    sidebar: {
      name: "",
      props: {},
    },
    location: {
      query: {},
    },
    setSidebar: jest.fn(),
    closeSidebar: jest.fn(),
    addActionToDashboard: jest.fn(),
    databases: {},
    params: { tabSlug: undefined },
  };

  renderWithProviders(<DashboardHeader {...dashboardHeaderProps} />, {
    storeInitialState: {
      settings,
      dashboard: createMockDashboardState({
        dashboardId: dashboard.id,
        dashboards: {
          [dashboard.id]: {
            ...dashboard,
            ordered_cards: dashboard.ordered_cards.map(c => c.id),
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
  });

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });
};

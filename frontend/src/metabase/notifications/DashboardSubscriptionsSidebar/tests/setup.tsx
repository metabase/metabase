/* istanbul ignore file */
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import type { Screen } from "__support__/ui";
import { renderWithProviders } from "__support__/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Dashboard,
  DashboardCard,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import DashboardSubscriptionsSidebar from "../DashboardSubscriptionsSidebar";

export const dashcard = createMockDashboardCard();

const actionDashcard = createMockActionDashboardCard({
  id: 2,
});
const linkDashcard = createMockActionDashboardCard({
  id: 3,
  card: createMockCard({ display: "link" }),
});

export const user = createMockUser();

const defaultDashcards = [dashcard, actionDashcard, linkDashcard];
const defaultParameters = [
  {
    name: "ID",
    slug: "id",
    id: "abcd1234",
    type: "id",
    sectionId: "id",
  },
];

function createDashboardState(
  dashboard: Dashboard,
  dashcards: DashboardCard[],
) {
  return createMockDashboardState({
    dashboardId: dashboard.id,
    dashcards: dashcards.reduce(
      (acc, card) => {
        acc[card.id] = card;
        return acc;
      },
      {} as Record<number, DashboardCard>,
    ),
    dashboards: {
      [dashboard.id]: {
        ...dashboard,
        dashcards: dashcards.map((d) => d.id),
      },
    },
  });
}

export function setup(
  {
    email,
    slack,
    tokenFeatures = {},
    hasEnterprisePlugins = false,
    isAdmin = false,
    dashcards = defaultDashcards,
    parameters = defaultParameters,
  }: {
    email?: boolean;
    slack?: boolean;
    tokenFeatures?: Partial<TokenFeatures>;
    hasEnterprisePlugins?: boolean;
    isAdmin?: boolean;
    dashcards?: DashboardCard[];
    parameters?: UiParameter[];
  } = {
    email: true,
    slack: true,
    tokenFeatures: {},
    hasEnterprisePlugins: false,
    isAdmin: false,
  },
) {
  const dashboard = createMockDashboard({
    dashcards,
    parameters,
  });

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

  setupUserRecipientsEndpoint({
    users: [user],
  });

  fetchMock.get(
    { url: `path:/api/pulse`, query: { dashboard_id: dashboard.id } },
    [],
  );

  fetchMock.post("path:/api/pulse/test", 200);

  const features = createMockTokenFeatures(tokenFeatures);
  const storeSettings = mockSettings({ "token-features": features });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <DashboardSubscriptionsSidebar
      dashboard={dashboard}
      onCancel={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        settings: storeSettings,
        currentUser: createMockUser({
          is_superuser: isAdmin,
        }),
        dashboard: createDashboardState(dashboard, dashcards),
      }),
    },
  );
}

export const hasAdvancedFilterOptionsHidden = (screen: Screen) => {
  expect(
    screen.queryByText(
      /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
    ),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByText(/set filter values for when this gets sent/i),
  ).not.toBeInTheDocument();

  expect(
    screen.queryByTestId("subscription-parameters-section"),
  ).not.toBeInTheDocument();

  return true;
};

export const hasBasicFilterOptions = (screen: Screen) => {
  expect(
    screen.getByText(
      /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
    ),
  ).toBeVisible();

  expect(
    screen.queryByText(/set filter values for when this gets sent/i),
  ).not.toBeInTheDocument();

  return true;
};

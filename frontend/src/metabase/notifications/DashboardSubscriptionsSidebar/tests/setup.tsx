/* istanbul ignore file */
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import type { Screen } from "__support__/ui";
import { renderWithProviders } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { scheduleSettingsToCron } from "metabase/admin/performance/utils";
import { isEmbeddingSdk as mockIsEmbeddingSdk } from "metabase/embedding-sdk/config";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Dashboard,
  DashboardCard,
  DashboardSubscription,
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
import type { Notification } from "metabase-types/api/notification";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import DashboardSubscriptionsSidebar from "../DashboardSubscriptionsSidebar";

jest.mock("metabase/embedding-sdk/config", () => ({
  isEmbeddingSdk: jest.fn(() => false),
}));

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

/** Convert pulse-shaped test data to a notification mock object */
function pulseToMockNotification(
  pulse: Partial<DashboardSubscription> & { id: number },
  dashboardId: number,
  creator: ReturnType<typeof createMockUser>,
): Notification {
  const channel = pulse.channels?.[0];
  const cronSchedule = channel
    ? scheduleSettingsToCron({
        schedule_day: channel.schedule_day,
        schedule_frame: channel.schedule_frame,
        schedule_hour: channel.schedule_hour,
        schedule_type: channel.schedule_type,
      })
    : "0 0 * * * ? *";

  return {
    id: pulse.id,
    active: !pulse.archived,
    payload_type: "notification/dashboard",
    payload: {
      dashboard_id: pulse.dashboard_id ?? dashboardId,
      parameters: (pulse.parameters as Record<string, unknown>[]) ?? null,
      skip_if_empty: pulse.skip_if_empty ?? false,
      dashboard_subscription_dashcards: null,
    },
    handlers: (pulse.channels ?? []).map((ch) => {
      if (ch.channel_type === "email") {
        return {
          channel_type: "channel/email" as const,
          active: ch.enabled !== false,
          recipients: (ch.recipients ?? []).map((u) => ({
            type: "notification-recipient/user" as const,
            user_id: u.id,
            details: null,
            user: u,
          })),
        };
      }
      if (ch.channel_type === "slack") {
        return {
          channel_type: "channel/slack" as const,
          active: ch.enabled !== false,
          recipients: ch.details?.channel
            ? [
                {
                  type: "notification-recipient/raw-value" as const,
                  details: { value: String(ch.details.channel) },
                },
              ]
            : [],
        };
      }
      return {
        channel_type: `channel/${ch.channel_type}` as any,
        active: ch.enabled !== false,
        recipients: [],
      };
    }),
    subscriptions: [
      {
        type: "notification-subscription/cron" as const,
        event_name: null,
        cron_schedule: cronSchedule,
        ui_display_type: null,
      },
    ],
    creator_id: creator.id,
    creator,
  } as Notification;
}

type SetupOpts = {
  email?: boolean;
  slack?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  isAdmin?: boolean;
  dashcards?: DashboardCard[];
  parameters?: UiParameter[];
  isEmbeddingSdk?: boolean;
  setSharing?: (sharing: boolean) => void;
  pulses?: (Partial<DashboardSubscription> & { id: number })[];
  currentUser?: {
    firstName: string;
    lastName: string;
  };
  pulseListDelay?: number;
};

export function setup({
  email = true,
  slack = true,
  tokenFeatures = {},
  enterprisePlugins,
  isAdmin = false,
  dashcards = defaultDashcards,
  parameters = defaultParameters,
  isEmbeddingSdk = false,
  setSharing,
  pulses = [],
  currentUser,
  pulseListDelay = 0,
}: SetupOpts = {}) {
  const dashboard = createMockDashboard({
    dashcards,
    parameters,
  });

  const currentUserMock = createMockUser({
    first_name: currentUser?.firstName,
    last_name: currentUser?.lastName,
    is_superuser: isAdmin,
  });

  // Convert pulse-shaped test data to notification format for the API mock
  const notifications: Notification[] = pulses.map((p) =>
    pulseToMockNotification(p, dashboard.id, currentUserMock),
  );

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

  (mockIsEmbeddingSdk as jest.Mock).mockReturnValue(isEmbeddingSdk);

  setupNotificationChannelsEndpoints(channelData.channels);

  setupUserRecipientsEndpoint({
    users: [user],
  });

  // Mock notification API
  fetchMock.get({
    url: `path:/api/notification`,
    response: () => notifications,
    // Delay is crucial to reproduce (EMB-1060), otherwise, the state updates too fast which isn't realistic
    delay: pulseListDelay,
  });

  // Mock POST that creates a notification and updates the GET response
  fetchMock.post("path:/api/notification", ({ options }) => {
    const body = JSON.parse(options.body as string);
    const newNotification = {
      ...body,
      id: getNextId(),
      active: true,
      creator_id: currentUserMock.id,
      creator: currentUserMock,
    } as Notification;
    notifications.push(newNotification);
    return newNotification;
  });

  // Mock PUT for archive/update — removes from notifications array so refetch returns updated list
  fetchMock.put({
    url: "express:/api/notification/:id",
    response: (callLog: any) => {
      const notificationId = parseInt(callLog.expressParams?.id);
      const idx = notifications.findIndex((n: any) => n.id === notificationId);
      if (idx !== -1) {
        const [removed] = notifications.splice(idx, 1);
        return { ...removed, active: false };
      }
      return {};
    },
  });

  fetchMock.post("path:/api/notification/send", 200);

  const features = createMockTokenFeatures(tokenFeatures);
  const storeSettings = mockSettings({ "token-features": features });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  renderWithProviders(
    <MockDashboardContext dashboard={dashboard} setSharing={setSharing}>
      <DashboardSubscriptionsSidebar />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        settings: storeSettings,
        currentUser: currentUserMock,
        dashboard: createDashboardState(dashboard, dashcards),
      }),
    },
  );
}

export const hasAdvancedFilterOptionsHidden = (screen: Screen) => {
  expect(
    screen.queryByText(
      /If a dashboard filter has a default value, it'll be applied when your subscription is sent./i,
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
      /If a dashboard filter has a default value, it'll be applied when your subscription is sent./i,
    ),
  ).toBeVisible();

  expect(
    screen.queryByText(/set filter values for when this gets sent/i),
  ).not.toBeInTheDocument();

  return true;
};

import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { UserWithApplicationPermissions } from "metabase/plugins";
import type {
  ChannelApiResponse,
  NotificationChannel,
  NotificationHandler,
} from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { NotificationChannelsPicker } from "./NotificationChannelsPicker";

export interface SetupOpts {
  userCanAccessSettings?: boolean;
  isAdmin?: boolean;
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isHttpSetup?: boolean;
  webhooksResult?: NotificationChannel[];
  notificationHandlers?: NotificationHandler[];
  onChange?: jest.Mock;
  defaultTemplates?: Record<
    string,
    {
      channel_type: string;
      details: {
        type: string;
        subject?: string;
        body: string;
      };
    }
  > | null;
  enableTemplates?: {
    email?: boolean;
    slack?: boolean;
  };
}

export const setup = ({
  userCanAccessSettings = false,
  isAdmin = false,
  isEmailSetup = true,
  isSlackSetup = false,
  isHttpSetup = false,
  webhooksResult = [],
  notificationHandlers = [],
  onChange = jest.fn(),
  defaultTemplates = null,
  enableTemplates,
}: SetupOpts = {}) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
    }),
  });

  setupNotificationChannelsEndpoints({
    slack: { configured: isSlackSetup },
    email: { configured: isEmailSetup },
    http: { configured: isHttpSetup },
  } as ChannelApiResponse["channels"]);

  setupWebhookChannelsEndpoint(webhooksResult);
  setupUserRecipientsEndpoint({ users: [] });

  const currentUser = createMockUser(
    isAdmin ? { is_superuser: true } : undefined,
  );

  if (userCanAccessSettings) {
    (currentUser as UserWithApplicationPermissions).permissions = {
      can_access_setting: true,
      can_access_monitoring: false,
      can_access_subscription: false,
    };
  }

  return renderWithProviders(
    <NotificationChannelsPicker
      notificationHandlers={notificationHandlers}
      channels={{
        email: {
          configured: isEmailSetup,
          type: "email",
          name: "Email",
          schedules: ["hourly"],
          schedule_type: "hourly",
          allows_recipients: true,
          recipients: ["user", "email"],
        },
        slack: {
          configured: isSlackSetup,
          type: "slack",
          name: "Slack",
          schedules: ["hourly"],
          schedule_type: "hourly",
          allows_recipients: true,
          fields: [],
        },
        http: {
          configured: isHttpSetup,
          type: "http",
          name: "HTTP",
          schedules: ["hourly"],
          schedule_type: "hourly",
          allows_recipients: false,
        },
      }}
      onChange={onChange}
      getInvalidRecipientText={(domains) =>
        `You're only allowed to email notifications to addresses ending in ${domains}`
      }
      defaultTemplates={defaultTemplates}
      enableTemplates={enableTemplates}
    />,
    {
      storeInitialState: {
        currentUser,
        settings,
      },
    },
  );
};

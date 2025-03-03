import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals";
import type {
  ChannelApiResponse,
  NotificationChannel,
  UserWithApplicationPermissions,
} from "metabase-types/api";
import {
  createMockCard,
  createMockTokenFeatures,
  createMockUser,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockChannel } from "metabase-types/api/mocks/channel";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";

describe("CreateOrEditQuestionAlertModal", () => {
  it("should display first available channel by default - Email", async () => {
    setup({
      isAdmin: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("alert-create")).toBeInTheDocument();
    });

    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it.each([{ isAdmin: true }, { isAdmin: false, userCanAccessSettings: true }])(
    "should display first available channel by default - Slack %p",
    async setupConfig => {
      setup({
        isEmailSetup: false,
        isSlackSetup: true,
        ...setupConfig,
      });

      await waitFor(() => {
        expect(screen.getByTestId("alert-create")).toBeInTheDocument();
      });

      expect(screen.queryByText("Email")).not.toBeInTheDocument();
      expect(screen.getByText("Slack")).toBeInTheDocument();
    },
  );

  it.each([{ isAdmin: true }, { isAdmin: false, userCanAccessSettings: true }])(
    "should display first available channel by default - Webhook %p",
    async setupConfig => {
      const mockWebhook = createMockChannel();
      setup({
        isEmailSetup: false,
        isHttpSetup: true,
        webhooksResult: [mockWebhook],
        ...setupConfig,
      });

      await waitFor(() => {
        expect(screen.getByTestId("alert-create")).toBeInTheDocument();
      });

      expect(screen.queryByText("Email")).not.toBeInTheDocument();
      expect(screen.getByText(mockWebhook.name)).toBeInTheDocument();
    },
  );

  it("should not show channels if user does not have permissions", async () => {
    const mockWebhook = createMockChannel();
    setup({
      isEmailSetup: false,
      isSlackSetup: true,
      isHttpSetup: true,
      webhooksResult: [mockWebhook],
      userCanAccessSettings: false,
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("alerts-channel-setup-modal"),
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("alert-create")).not.toBeInTheDocument();
  });
});

function setup({
  userCanAccessSettings = false,
  isAdmin = false,
  isEmailSetup = true,
  isSlackSetup = false,
  isHttpSetup = false,
  webhooksResult = [],
}: {
  userCanAccessSettings?: boolean;
  isAdmin?: boolean;
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isHttpSetup?: boolean;
  webhooksResult?: NotificationChannel[];
}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
    }),
  });

  setupEnterprisePlugins();

  const mockCard = createMockCard({
    display: "line",
    visualization_settings: createMockVisualizationSettings({
      "graph.show_goal": true,
      "graph.metrics": ["count"],
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

  renderWithProviders(
    <CreateOrEditQuestionAlertModal
      editingNotification={undefined}
      onAlertCreated={jest.fn()}
      onClose={jest.fn()}
    />,
    {
      storeInitialState: {
        currentUser,
        qb: createMockQueryBuilderState({
          card: mockCard,
        }),
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
          questions: [mockCard],
        }),
        settings,
      },
    },
  );
}

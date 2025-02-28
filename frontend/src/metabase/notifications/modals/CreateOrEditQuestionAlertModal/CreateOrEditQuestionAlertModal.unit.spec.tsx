import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals";
import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";
import type {
  ChannelApiResponse,
  NotificationChannel,
} from "metabase-types/api";
import {
  createMockCard,
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
      expect(screen.getByText("New alert")).toBeInTheDocument();
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
        expect(screen.getByText("New alert")).toBeInTheDocument();
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
        expect(screen.getByText("New alert")).toBeInTheDocument();
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
      expect(screen.getByText("Alerts")).toBeInTheDocument();
    });

    expect(screen.queryByText("New alert")).not.toBeInTheDocument();
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

  /**
   * Technically this is a dirty hack to avoid loading enterprise packages
   * and rely on typings from enterprise package to mock the user:
   * - import { UserWithApplicationPermissions } from "metabase-enterprise/application_permissions/types/user";
   * - createMockUser({ ... } as UserWithApplicationPermissions);
   *
   * However the trade-off is worth it, because 4 LOC keeps the test clean,
   * avoids loading unnecessary code or writing e2e tests for this.
   */
  jest
    .spyOn(PLUGIN_APPLICATION_PERMISSIONS.selectors, "canAccessSettings")
    .mockReturnValue(userCanAccessSettings);

  renderWithProviders(
    <CreateOrEditQuestionAlertModal
      editingNotification={undefined}
      onAlertCreated={jest.fn()}
      onClose={jest.fn()}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser(
          isAdmin ? { is_superuser: true } : undefined,
        ),
        qb: createMockQueryBuilderState({
          card: mockCard,
        }),
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
          questions: [mockCard],
        }),
      },
    },
  );
}

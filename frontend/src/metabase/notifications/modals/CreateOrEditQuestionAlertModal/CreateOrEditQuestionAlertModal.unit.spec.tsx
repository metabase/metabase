import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals";
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

  it("should display first available channel by default - Slack", async () => {
    setup({
      isEmailSetup: false,
      isSlackSetup: true,
      isAdmin: true,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });

  it("should display first available channel by default - Webhook", async () => {
    const mockWebhook = createMockChannel();
    setup({
      isEmailSetup: false,
      isHttpSetup: true,
      isAdmin: true,
      webhooksResult: [mockWebhook],
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.getByText(mockWebhook.name)).toBeInTheDocument();
  });
});

function setup({
  isAdmin = false,
  isEmailSetup = true,
  isSlackSetup = false,
  isHttpSetup = false,
  webhooksResult = [],
}: {
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

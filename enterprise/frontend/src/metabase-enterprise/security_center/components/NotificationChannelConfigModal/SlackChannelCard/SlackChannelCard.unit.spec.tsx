import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockEmailChannelSpec,
  createMockSlackChannelSpec,
} from "metabase-types/api/mocks/security-center";

import type { NotificationConfig } from "../../../hooks/use-notification-config";
import { useNotificationConfig } from "../../../hooks/use-notification-config";

import { SlackChannelCard } from "./SlackChannelCard";

jest.mock("../../../hooks/use-notification-config", () => ({
  ...jest.requireActual("../../../hooks/use-notification-config"),
  useNotificationConfig: jest.fn(),
}));

const mockedUseNotificationConfig =
  useNotificationConfig as any as jest.MockedFn<typeof useNotificationConfig>;

const DEFAULT_CONFIG: NotificationConfig = {
  email: {
    sendToAllAdmins: true,
    handler: { channel_type: "channel/email", recipients: [] },
  },
  slack: {
    enabled: false,
    handler: { channel_type: "channel/slack", recipients: [] },
  },
};

function setup({
  isConfigured = true,
  config = DEFAULT_CONFIG,
  slackEnabled,
}: {
  isConfigured?: boolean;
  config?: NotificationConfig;
  slackEnabled?: boolean;
} = {}) {
  const channels = {
    email: createMockEmailChannelSpec(),
    slack: createMockSlackChannelSpec({ configured: isConfigured }),
  };

  const updateSlackHandler = jest.fn();
  const toggleSlack = jest.fn();

  mockedUseNotificationConfig.mockReturnValue({
    config: {
      ...config,
      slack: { ...config.slack, enabled: slackEnabled ?? config.slack.enabled },
    },
    users: [],
    channels,
    updateEmailHandler: jest.fn(),
    toggleSendToAllAdmins: jest.fn(),
    updateSlackHandler,
    toggleSlack,
    save: jest.fn(),
    resetConfig: jest.fn(),
  });

  renderWithProviders(<SlackChannelCard isConfigured={isConfigured} />);

  return { updateSlackHandler, toggleSlack };
}

describe("SlackChannelCard", () => {
  it("renders not-configured state with setup link", () => {
    setup({ isConfigured: false });

    expect(screen.getByText("Slack is not configured.")).toBeInTheDocument();
    expect(screen.getByText("Set up Slack")).toHaveAttribute(
      "href",
      "/admin/settings/slack",
    );
  });

  it("renders configured state with toggle", () => {
    setup();

    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByTestId("slack-toggle")).toBeInTheDocument();
  });

  it("does not show channel picker when slack is disabled", () => {
    setup({ slackEnabled: false });

    expect(screen.queryByText("Channel")).not.toBeInTheDocument();
  });

  it("shows channel picker when slack is enabled", () => {
    setup({ slackEnabled: true });

    expect(screen.getByText("Channel")).toBeInTheDocument();
  });
});

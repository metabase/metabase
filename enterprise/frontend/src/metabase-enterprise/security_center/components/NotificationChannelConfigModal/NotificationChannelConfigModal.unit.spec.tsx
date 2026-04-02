import userEvent from "@testing-library/user-event";

import { setupRecentViewsAndSelectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import {
  createMockEmailChannelSpec,
  createMockSlackChannelSpec,
} from "metabase-types/api/mocks/security-center";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { NotificationConfig } from "../../hooks/use-notification-config";
import { useNotificationConfig } from "../../hooks/use-notification-config";

import { NotificationChannelConfigModal } from "./NotificationChannelConfigModal";

jest.mock("../../hooks/use-notification-config", () => {
  return {
    ...jest.requireActual("../../hooks/use-notification-config"),
    useNotificationConfig: jest.fn(),
  };
});

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
  config = DEFAULT_CONFIG,
  emailConfigured = true,
  slackConfigured = false,
  onClose = jest.fn(),
  save = jest.fn(),
} = {}) {
  const settings = createMockSettings({
    "email-configured?": emailConfigured,
    "slack-token-valid?": slackConfigured,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);

  const channels = {
    email: createMockEmailChannelSpec({ configured: emailConfigured }),
    slack: createMockSlackChannelSpec({ configured: slackConfigured }),
  };

  const resetConfig = jest.fn();

  mockedUseNotificationConfig.mockImplementation(() => ({
    config,
    users: [],
    channels,
    updateEmailHandler: jest.fn(),
    toggleSendToAllAdmins: jest.fn(),
    updateSlackHandler: jest.fn(),
    toggleSlack: jest.fn(),
    save,
    resetConfig,
  }));

  renderWithProviders(
    <NotificationChannelConfigModal
      opened
      onClose={onClose}
      resetConfig={resetConfig}
    />,
    {
      storeInitialState: { settings: createMockSettingsState(settings) },
    },
  );

  return { onClose };
}

describe("NotificationChannelConfigModal", () => {
  it("renders email and slack sections", () => {
    setup();

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });

  it("shows 'Send to all instance admins' toggle checked by default", () => {
    setup();

    const toggle = screen.getByTestId("send-to-admins-toggle");
    expect(toggle).toBeChecked();
  });

  it("shows recipient picker with 'Additional recipients' label when 'Send to all admins' is checked", () => {
    setup();

    expect(screen.getByText("Additional recipients")).toBeInTheDocument();
    expect(
      screen.queryByText("At least one recipient is required."),
    ).not.toBeInTheDocument();
  });

  it("shows recipient picker with 'Recipients' label and error when 'Send to all admins' is unchecked and no recipients", () => {
    setup({
      config: {
        email: {
          sendToAllAdmins: false,
          handler: { channel_type: "channel/email", recipients: [] },
        },
        slack: {
          enabled: false,
          handler: { channel_type: "channel/slack", recipients: [] },
        },
      },
    });

    expect(screen.getByText("Recipients")).toBeInTheDocument();
    expect(
      screen.getByText("At least one recipient is required."),
    ).toBeInTheDocument();
  });

  it("shows email not configured state with setup link", () => {
    setup({ emailConfigured: false });

    expect(screen.getByText("Email is not configured.")).toBeInTheDocument();
    expect(screen.getByText("Set up email")).toHaveAttribute(
      "href",
      "/admin/settings/email",
    );
  });

  it("shows slack not configured state with setup link", () => {
    setup({ slackConfigured: false });

    expect(screen.getByText("Slack is not configured.")).toBeInTheDocument();
    expect(screen.getByText("Set up Slack")).toHaveAttribute(
      "href",
      "/admin/settings/slack",
    );
  });

  it("shows slack channel picker when slack is configured and enabled", () => {
    setup({
      slackConfigured: true,
      config: {
        email: {
          sendToAllAdmins: true,
          handler: { channel_type: "channel/email", recipients: [] },
        },
        slack: {
          enabled: true,
          handler: { channel_type: "channel/slack", recipients: [] },
        },
      },
    });

    expect(
      screen.getByPlaceholderText("Pick a user or channel..."),
    ).toBeInTheDocument();
  });

  it("hides slack channel picker when slack toggle is off", () => {
    setup({
      slackConfigured: true,
      config: {
        email: {
          sendToAllAdmins: true,
          handler: { channel_type: "channel/email", recipients: [] },
        },
        slack: {
          enabled: false,
          handler: { channel_type: "channel/slack", recipients: [] },
        },
      },
    });

    expect(
      screen.queryByPlaceholderText("Pick a user or channel..."),
    ).not.toBeInTheDocument();
  });

  it("disables save when email has no recipients and admins toggle is off", () => {
    setup({
      config: {
        email: {
          sendToAllAdmins: false,
          handler: { channel_type: "channel/email", recipients: [] },
        },
        slack: {
          enabled: false,
          handler: { channel_type: "channel/slack", recipients: [] },
        },
      },
    });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("enables save when 'Send to all admins' is on", () => {
    setup();

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("calls save and onClose on successful save", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { onClose } = setup({ save });

    await userEvent.click(screen.getByText("Save"));

    expect(save).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when cancel is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
  });

  it("does not render test buttons", () => {
    setup({ slackConfigured: true });

    expect(screen.queryByText("Send test email")).not.toBeInTheDocument();
    expect(screen.queryByText("Send test message")).not.toBeInTheDocument();
  });
});

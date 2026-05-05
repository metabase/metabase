import { setupRecentViewsAndSelectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import type { NotificationConfig } from "../../../hooks/use-notification-config";
import { useNotificationConfig } from "../../../hooks/use-notification-config";

import { EmailChannelCard } from "./EmailChannelCard";

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

function setup({ isConfigured = true, config = DEFAULT_CONFIG } = {}) {
  const settings = createMockSettings({
    "email-configured?": isConfigured,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);

  const updateEmailHandler = jest.fn();
  const toggleSendToAllAdmins = jest.fn();

  mockedUseNotificationConfig.mockReturnValue({
    config,
    users: [],
    channels: undefined,
    updateEmailHandler,
    toggleSendToAllAdmins,
    updateSlackHandler: jest.fn(),
    toggleSlack: jest.fn(),
    save: jest.fn(),
    resetConfig: jest.fn(),
  });

  renderWithProviders(<EmailChannelCard isConfigured={isConfigured} />, {
    storeInitialState: { settings: createMockSettingsState(settings) },
  });

  return { updateEmailHandler, toggleSendToAllAdmins };
}

describe("EmailChannelCard", () => {
  it("renders not-configured state with setup link", () => {
    setup({ isConfigured: false });

    expect(screen.getByText("Email is not configured.")).toBeInTheDocument();
    expect(screen.getByText("Set up email")).toHaveAttribute(
      "href",
      "/admin/settings/email",
    );
  });

  it("renders configured state with admin toggle and recipient picker", () => {
    setup();

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByTestId("send-to-admins-toggle")).toBeChecked();
    expect(screen.getByText("Additional recipients")).toBeInTheDocument();
  });

  it("shows 'Recipients' label when send-to-all-admins is off", () => {
    setup({
      config: {
        ...DEFAULT_CONFIG,
        email: {
          sendToAllAdmins: false,
          handler: { channel_type: "channel/email", recipients: [] },
        },
      },
    });

    expect(screen.getByText("Recipients")).toBeInTheDocument();
  });

  it("shows error when send-to-all-admins is off and no recipients", () => {
    setup({
      config: {
        ...DEFAULT_CONFIG,
        email: {
          sendToAllAdmins: false,
          handler: { channel_type: "channel/email", recipients: [] },
        },
      },
    });

    expect(
      screen.getByText("At least one recipient is required."),
    ).toBeInTheDocument();
  });

  it("does not show error when send-to-all-admins is on", () => {
    setup();

    expect(
      screen.queryByText("At least one recipient is required."),
    ).not.toBeInTheDocument();
  });
});

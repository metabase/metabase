import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupNotificationChannelsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupUpdateSettingsEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { findRequests } from "__support__/server-mocks/util";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import {
  createMockEmailChannelSpec,
  createMockSlackChannelSpec,
} from "metabase-types/api/mocks/security-center";

import type { NotificationConfig } from "../../hooks/use-notification-config";
import {
  NotificationConfigProvider,
  useNotificationConfig,
  useNotificationConfigState,
} from "../../hooks/use-notification-config";

import { NotificationChannelConfigModal } from "./NotificationChannelConfigModal";

// ── UI behaviour tests (mocked hook) ────────────────────────────────

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

function setupMocked({
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
    <NotificationChannelConfigModal opened onClose={onClose} />,
    {
      storeInitialState: { settings: createMockSettingsState(settings) },
    },
  );

  return { onClose };
}

describe("NotificationChannelConfigModal", () => {
  it("renders email and slack sections", () => {
    setupMocked();

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });

  it("shows 'Send to all instance admins' toggle checked by default", () => {
    setupMocked();

    const toggle = screen.getByTestId("send-to-admins-toggle");
    expect(toggle).toBeChecked();
  });

  it("shows recipient picker with 'Additional recipients' label when 'Send to all admins' is checked", () => {
    setupMocked();

    expect(screen.getByText("Additional recipients")).toBeInTheDocument();
    expect(
      screen.queryByText("At least one recipient is required."),
    ).not.toBeInTheDocument();
  });

  it("shows recipient picker with 'Recipients' label and error when 'Send to all admins' is unchecked and no recipients", () => {
    setupMocked({
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
    setupMocked({ emailConfigured: false });

    expect(screen.getByText("Email is not configured.")).toBeInTheDocument();
    expect(screen.getByText("Set up email")).toHaveAttribute(
      "href",
      "/admin/settings/email",
    );
  });

  it("shows slack not configured state with setup link", () => {
    setupMocked({ slackConfigured: false });

    expect(screen.getByText("Slack is not configured.")).toBeInTheDocument();
    expect(screen.getByText("Set up Slack")).toHaveAttribute(
      "href",
      "/admin/settings/slack",
    );
  });

  it("shows slack channel picker when slack is configured and enabled", () => {
    setupMocked({
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
    setupMocked({
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
    setupMocked({
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
    setupMocked();

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("calls save and onClose on successful save", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { onClose } = setupMocked({ save });

    await userEvent.click(screen.getByText("Save"));

    expect(save).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when cancel is clicked", async () => {
    const { onClose } = setupMocked();

    await userEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
  });

  it("does not render test buttons", () => {
    setupMocked({ slackConfigured: true });

    expect(screen.queryByText("Send test email")).not.toBeInTheDocument();
    expect(screen.queryByText("Send test message")).not.toBeInTheDocument();
  });
});

// ── Save‐payload tests (real hook + context) ────────────────────────

function ModalWithProvider({ onClose }: { onClose: () => void }) {
  const notificationConfig = useNotificationConfigState();
  return (
    <NotificationConfigProvider value={notificationConfig}>
      <NotificationChannelConfigModal opened onClose={onClose} />
    </NotificationConfigProvider>
  );
}

const ADMIN_GROUP_RECIPIENT = {
  type: "notification-recipient/group",
  permissions_group_id: 2,
};

function setupWithRealHook({
  emailConfigured = true,
  slackConfigured = true,
  slackChannel = null as string | null,
  emailRecipients = null as any[] | null,
} = {}) {
  // Restore the real implementation for save-payload tests
  mockedUseNotificationConfig.mockImplementation(
    jest.requireActual("../../hooks/use-notification-config")
      .useNotificationConfig,
  );

  const settings = createMockSettings({
    "email-configured?": emailConfigured,
    "slack-token-valid?": slackConfigured,
    "security-center-slack-channel": slackChannel,
    "security-center-email-recipients": emailRecipients,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupUpdateSettingsEndpoint();
  setupUserRecipientsEndpoint({
    users: [
      createMockUser({ id: 1, common_name: "Alice" }),
      createMockUser({ id: 2, common_name: "Bob" }),
    ],
  });
  setupNotificationChannelsEndpoints({
    email: createMockEmailChannelSpec({ configured: emailConfigured }),
    slack: createMockSlackChannelSpec({
      configured: slackConfigured,
      fields: [
        {
          name: "channel",
          displayName: "Post to",
          options: [
            { displayName: "#general", id: "C001" },
            { displayName: "#security", id: "C002" },
            { displayName: "#alerts", id: "C003" },
          ],
          required: true,
        },
      ],
    }),
  });
  fetchMock.post("path:/api/ee/security-center/test-notification", {
    success: true,
  });

  const onClose = jest.fn();

  renderWithProviders(<ModalWithProvider onClose={onClose} />, {
    storeInitialState: { settings: createMockSettingsState(settings) },
  });

  return { onClose };
}

async function getSavedSettings() {
  const puts = await findRequests("PUT");
  return puts.find((r) => r.url.includes("/api/setting"))?.body;
}

describe("NotificationChannelConfigModal — save payload", () => {
  describe("slack channel", () => {
    it("saves the selected slack channel", async () => {
      setupWithRealHook({ slackConfigured: true });

      await userEvent.click(screen.getByTestId("slack-toggle"));

      const channelInput = screen.getByPlaceholderText(
        "Pick a user or channel...",
      );
      await userEvent.clear(channelInput);
      await userEvent.type(channelInput, "#security");

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        expect(body).toEqual(
          expect.objectContaining({
            "security-center-slack-channel": "#security",
          }),
        );
      });
    });

    it("preserves an existing slack channel on save when unchanged", async () => {
      setupWithRealHook({ slackConfigured: true, slackChannel: "#general" });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        expect(body).toEqual(
          expect.objectContaining({
            "security-center-slack-channel": "#general",
          }),
        );
      });
    });

    it("sends null for slack channel when slack is disabled", async () => {
      setupWithRealHook({ slackConfigured: true, slackChannel: "#general" });

      await userEvent.click(screen.getByTestId("slack-toggle"));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        expect(body).toEqual(
          expect.objectContaining({
            "security-center-slack-channel": null,
          }),
        );
      });
    });
  });

  describe("email recipients", () => {
    it("includes admin group recipient when send-to-all-admins is on (default)", async () => {
      setupWithRealHook({ emailConfigured: true });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        expect(body["security-center-email-recipients"]).toEqual(
          expect.arrayContaining([
            expect.objectContaining(ADMIN_GROUP_RECIPIENT),
          ]),
        );
      });
    });

    it("omits admin group recipient when send-to-all-admins is toggled off", async () => {
      setupWithRealHook({ emailConfigured: true });

      await userEvent.click(screen.getByTestId("send-to-admins-toggle"));
      await userEvent.type(
        screen.getByPlaceholderText(/Enter user names or email/i),
        "test@example.com{enter}",
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        const recipients = body["security-center-email-recipients"];
        expect(recipients).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining(ADMIN_GROUP_RECIPIENT),
          ]),
        );
      });
    });

    it("preserves existing extra recipients alongside admin group", async () => {
      const existingRecipients = [
        ADMIN_GROUP_RECIPIENT,
        {
          type: "notification-recipient/raw-value",
          details: { value: "existing@example.com" },
        },
      ];
      setupWithRealHook({
        emailConfigured: true,
        emailRecipients: existingRecipients,
      });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        const recipients = body["security-center-email-recipients"];
        expect(recipients).toEqual(
          expect.arrayContaining([
            expect.objectContaining(ADMIN_GROUP_RECIPIENT),
            expect.objectContaining({
              type: "notification-recipient/raw-value",
              details: { value: "existing@example.com" },
            }),
          ]),
        );
      });
    });

    it("saves both email and slack settings in a single request", async () => {
      setupWithRealHook({ slackConfigured: true, slackChannel: "#general" });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(async () => {
        const body = await getSavedSettings();
        expect(body).toEqual(
          expect.objectContaining({
            "security-center-email-recipients": expect.any(Array),
            "security-center-slack-channel": "#general",
          }),
        );
      });
    });
  });
});

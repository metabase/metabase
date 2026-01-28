import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackManifestEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { renderWithProviders, screen } from "__support__/ui";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { NotificationSettingsPage } from "./NotificationSettingsPage";

const setup = async ({
  isSlackTokenValid = true,
  slackAppToken = "xoxb-test-token",
}: {
  isSlackTokenValid?: boolean;
  slackAppToken?: string | null;
} = {}) => {
  const settings = createMockSettings({
    "slack-token-valid?": isSlackTokenValid,
    "slack-app-token": slackAppToken,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );
  setupSlackManifestEndpoint();
  setupWebhookChannelsEndpoint();

  renderWithProviders(<NotificationSettingsPage />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  await screen.findByText("Notifications");
};

describe("NotificationSettingsPage", () => {
  it("shows Slack status inside the card when connected", async () => {
    await setup();

    expect(screen.getByText("Slack app is working")).toBeInTheDocument();
  });

  it("shows Slack error status when the token is invalid", async () => {
    await setup({ isSlackTokenValid: false });

    expect(screen.getByText("Slack app is not working.")).toBeInTheDocument();
  });

  it("shows connect CTA when the Slack app is not configured", async () => {
    await setup({ slackAppToken: null });

    expect(screen.getByText("Connect to Slack")).toBeInTheDocument();
  });
});

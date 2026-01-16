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
}: {
  isSlackTokenValid?: boolean;
} = {}) => {
  const settings = createMockSettings({
    "slack-token": "xoxb-test-token",
    "slack-token-valid?": isSlackTokenValid,
    "slack-app-token": "",
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
  it("shows connected Slack status with a badge when connected", async () => {
    await setup();

    expect(screen.getByText("Connected to Slack")).toBeInTheDocument();
    expect(screen.getByText("Slack bot is working.")).toBeInTheDocument();
  });

  it("shows not connected Slack status with a badge when token is invalid", async () => {
    await setup({ isSlackTokenValid: false });

    expect(screen.getByText("Connect to Slack")).toBeInTheDocument();
    expect(screen.getByText("Slack bot is not working.")).toBeInTheDocument();
  });
});

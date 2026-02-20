import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackAppInfoEndpoint,
  setupSlackSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SlackConfiguration } from "./SlackConfiguration";

const setup = async ({ bugReporting }: { bugReporting: boolean }) => {
  const settings = createMockSettings({
    "slack-app-token": "xoxb-test-token",
    "slack-token-valid?": true,
    "bug-reporting-enabled": bugReporting,
    "slack-bug-report-channel": bugReporting ? "bug-reporting-channel" : null,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupSlackSettingsEndpoint();
  setupSlackAppInfoEndpoint();

  renderWithProviders(<SlackConfiguration />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  await screen.findByText("2. Configure your Slack App");
};

describe("SlackConfiguration", () => {
  it("should show bug reporting channel if bug reporting is enabled", async () => {
    await setup({ bugReporting: true });
    expect(
      await screen.findByText("Slack bug report channel"),
    ).toBeInTheDocument();
  });

  it("should not show bug reporting channel if bug reporting is disabled", async () => {
    await setup({ bugReporting: false });
    expect(
      screen.queryByText("Slack bug report channel"),
    ).not.toBeInTheDocument();
  });

  it("should show app icon configuration", async () => {
    await setup({ bugReporting: false });
    expect(screen.getByText("Slack app icon")).toBeInTheDocument();
    expect(screen.getByText("Download icon")).toBeInTheDocument();
  });
});

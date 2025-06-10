import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackManifestEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { SlackSettingsModal } from "./SlackSettingsModal";

const setup = async ({
  isApp,
  isBot,
  isValid,
}: {
  isApp: boolean;
  isBot: boolean;
  isValid: boolean;
}) => {
  const settings = createMockSettings({
    "slack-app-token": isApp ? "app-token" : null,
    "slack-token-valid?": isValid,
    "slack-token": isBot ? "bot-token" : null,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  setupSlackManifestEndpoint();

  renderWithProviders(<SlackSettingsModal isOpen onClose={() => {}} />);

  await screen.findByText("Metabase on Slack");
};

describe("SlackSettingsModal", () => {
  it("should render the status display when the app is configured", async () => {
    await setup({ isApp: true, isBot: false, isValid: true });

    expect(screen.getByText("Metabase on Slack")).toBeInTheDocument();
    expect(await screen.findByText("Slack app is working")).toBeInTheDocument();

    const gets = await findRequests("GET");
    expect(gets).toHaveLength(2);
    const manifestRequest = gets.find((request) =>
      request.url.includes("manifest"),
    );
    expect(manifestRequest).not.toBeDefined();
  });

  it("should render the setup display and load the manifest when the app is not configured", async () => {
    await setup({ isApp: false, isBot: false, isValid: false });

    expect(screen.getByText("Metabase on Slack")).toBeInTheDocument();

    expect(
      screen.getByText("1. Click the button below and create your Slack App"),
    ).toBeInTheDocument();

    await waitFor(async () => {
      const gets = await findRequests("GET");
      expect(gets).toHaveLength(3);
    });

    const gets = await findRequests("GET");
    const manifestRequest = gets.find((request) =>
      request.url.includes("manifest"),
    );
    expect(manifestRequest).toBeDefined();
  });
});

import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackAppInfoEndpoint,
  setupSlackManifestEndpoint,
  setupSlackSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SlackSetup } from "./SlackSetup";

interface SetupOptions {
  configured?: boolean;
  isValid?: boolean;
  bugReporting?: boolean;
}

const setup = async ({
  configured = false,
  isValid = true,
  bugReporting = false,
}: SetupOptions = {}) => {
  const settings = createMockSettings({
    "slack-app-token": configured ? "xoxb-test-token" : null,
    "slack-token-valid?": configured && isValid,
    "bug-reporting-enabled": bugReporting,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupSlackSettingsEndpoint();
  setupSlackManifestEndpoint();
  setupSlackAppInfoEndpoint();

  renderWithProviders(<SlackSetup />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  if (configured) {
    if (isValid) {
      await screen.findByText(/Slack app is working/i);
    } else {
      await screen.findByText(/Slack app is not working/i);
    }
  } else {
    await screen.findByText(/Create a Slack app and connect to it/i);
  }
};

describe("SlackSetup", () => {
  it("should fetch the slack manifest", async () => {
    await setup();

    await waitFor(async () => {
      const gets = await findRequests("GET");
      const manifestRequest = gets.find((request) =>
        request.url.includes("manifest"),
      );
      expect(manifestRequest).toBeDefined();
    });
  });

  it("should show instructions to set up a slack app", async () => {
    await setup();

    expect(
      await screen.findByText("Create a Slack app and connect to it."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Create Slack App")).toBeInTheDocument();
  });

  it("should show token input", async () => {
    await setup();

    const input = await screen.findByLabelText("Slack bot user OAuth token");
    expect(input).toBeInTheDocument();
  });

  it("should submit new slack settings", async () => {
    await setup();

    const tokenInput = await screen.findByLabelText(
      "Slack bot user OAuth token",
    );
    await userEvent.type(tokenInput, "new-bot-token");

    const submitButton = screen.getByRole("button", { name: "Connect" });
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/api/slack/settings");
    expect(body).toEqual({
      "slack-app-token": "new-bot-token",
    });
  });

  it("should show bug reporting channel if bug reporting is enabled", async () => {
    await setup({ configured: true, bugReporting: true });

    expect(
      await screen.findByText("Slack bug report channel"),
    ).toBeInTheDocument();
  });

  it("should not show bug reporting channel if bug reporting is disabled", async () => {
    await setup({ configured: true });

    expect(
      screen.queryByText("Slack bug report channel"),
    ).not.toBeInTheDocument();
  });

  it("should show app icon configuration", async () => {
    await setup({ configured: true });

    expect(screen.getByText("Slack app icon")).toBeInTheDocument();
    expect(screen.getByText("Download App Icon")).toBeInTheDocument();
  });

  it("should show invalid status badge", async () => {
    await setup({ configured: true, isValid: false });

    expect(
      await screen.findByText("Slack app is not working."),
    ).toBeInTheDocument();
  });

  it("should allow disconnecting the slack connection", async () => {
    await setup({ configured: true });

    const disconnectButton = await screen.findByRole("button", {
      name: "Disconnect",
    });
    await userEvent.click(disconnectButton);

    // Modal opens with another Disconnect button - get all and click the second one (confirm)
    const disconnectButtons = await screen.findAllByRole("button", {
      name: "Disconnect",
    });
    await userEvent.click(disconnectButtons[1]);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("api/slack/settings");
    expect(body).toEqual({ "slack-app-token": null });
  });
});

import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackManifestEndpoint,
  setupSlackSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { SlackSetup } from "./SlackSetup";

const setup = async ({
  bugReporting,
  botToken,
}: {
  bugReporting?: boolean;
  botToken?: boolean;
}) => {
  const settings = createMockSettings({
    "slack-app-token": null,
    "slack-token": botToken ? "bot-token" : null,
    "bug-reporting-enabled": !!bugReporting,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  setupSlackSettingsEndpoint();
  setupSlackManifestEndpoint();

  renderWithProviders(<SlackSetup />);

  await screen.findByText(/Activate the OAuth token/i);
};

describe("SlackSetup", () => {
  it("should fetch the slack manifest", async () => {
    await setup({ bugReporting: false });

    await waitFor(async () => {
      const gets = await findRequests("GET");
      const manifestRequest = gets.find((request) =>
        request.url.includes("manifest"),
      );
      expect(manifestRequest).toBeDefined();
    });
  });

  it("should show notice about legacy bot tokens", async () => {
    await setup({ bugReporting: false, botToken: true });
    expect(
      await screen.findByText(/upgrade to Slack Apps/),
    ).toBeInTheDocument();
  });

  it("should show instructions to set up a slack app", async () => {
    await setup({ bugReporting: false });

    expect(
      await screen.findByText(
        "1. Click the button below and create your Slack App",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Create Slack App")).toBeInTheDocument();
  });

  it("should show token input", async () => {
    await setup({ bugReporting: false });

    const input = await screen.findByLabelText("Slack bot user OAuth token");
    expect(input).toBeInTheDocument();
  });

  it("should show bug reporting channel if bug reporting is enabled", async () => {
    await setup({ bugReporting: true });

    expect(
      await screen.findByText("Public channel for bug reports"),
    ).toBeInTheDocument();
  });

  it("should not show bug reporting channel if bug reporting is disabled", async () => {
    await setup({ bugReporting: false });

    await screen.findByLabelText("Slack bot user OAuth token");
    expect(
      screen.queryByText("Public channel for bug reports"),
    ).not.toBeInTheDocument();
  });

  it("should submit new slack settings", async () => {
    setup({ bugReporting: true });

    const tokenInput = await screen.findByLabelText(
      "Slack bot user OAuth token",
    );
    await userEvent.type(tokenInput, "new-bot-token");

    const channelInput = await screen.findByLabelText(
      "Public channel for bug reports",
    );
    await userEvent.type(channelInput, "new-bot-channel");

    const submitButton = screen.getByRole("button", { name: "Save changes" });
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/api/slack/settings");
    expect(body).toEqual({
      "slack-app-token": "new-bot-token",
      "slack-bug-report-channel": "new-bot-channel",
    });
  });
});

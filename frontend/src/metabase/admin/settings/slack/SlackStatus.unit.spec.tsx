import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupSlackSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { SlackStatus } from "./SlackStatus";

const setup = async ({
  isValid,
  bugReporting,
}: {
  isValid: boolean;
  bugReporting?: boolean;
}) => {
  const settings = createMockSettings({
    "slack-app-token": "app-token",
    "slack-token-valid?": isValid,
    "bug-reporting-enabled": !!bugReporting,
    "slack-bug-report-channel": bugReporting ? "bug-reporting-channel" : null,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  setupSlackSettingsEndpoint();

  renderWithProviders(<SlackStatus />);

  await screen.findByText("Slack token");
};

describe("SlackStatus", () => {
  it("should show valid status badge", async () => {
    await setup({ isValid: true });
    expect(await screen.findByText("Slack app is working")).toBeInTheDocument();
  });

  it("Should show invalid status badge", async () => {
    await setup({ isValid: false });
    expect(
      await screen.findByText("Slack app is not working."),
    ).toBeInTheDocument();
  });

  it("Should show disabled token input", async () => {
    await setup({ isValid: true });

    const input = await screen.findByLabelText("Slack token");
    expect(input).toBeDisabled();
  });

  it("should show bug reporting channel if bug reporting is enabled", async () => {
    await setup({ isValid: true, bugReporting: true });
    await screen.findByLabelText("Slack token");
    expect(
      await screen.findByText("Slack bug report channel"),
    ).toBeInTheDocument();
  });

  it("should not show bug reporting channel if bug reporting is disabled", async () => {
    await setup({ isValid: true, bugReporting: false });
    await screen.findByLabelText("Slack token");
    expect(
      screen.queryByText("Slack Bug report channel"),
    ).not.toBeInTheDocument();
  });

  it("should allow deleting the slack connection", async () => {
    await setup({ isValid: true, bugReporting: false });

    const deleteButton = await screen.findByRole("button", {
      name: "Delete Slack App",
    });
    await userEvent.click(deleteButton);

    // modal confirm
    const confirmButton = await screen.findByRole("button", { name: "Delete" });
    await userEvent.click(confirmButton);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("api/slack/settings");
    expect(body).toEqual({});
  });
});

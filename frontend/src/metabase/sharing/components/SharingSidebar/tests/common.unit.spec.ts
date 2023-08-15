import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";

import { setup, dashcard, user, hasBasicFilterOptions } from "./setup";

describe("SharingSidebar", () => {
  it("should have options for email and slack", async () => {
    setup({ email: true });

    expect(await screen.findByText("Email it")).toBeInTheDocument();
    expect(await screen.findByText("Send it to Slack")).toBeInTheDocument();
  });

  it("should disable slack option when slack is not configured", async () => {
    setup({ email: true, slack: false });

    expect(await screen.findByText(/First, you'll have to/i)).toBeVisible();
    expect(await screen.findByText(/configure Slack/i)).toBeVisible();
  });

  it("should disable email option when email is not configured", async () => {
    setup({ email: false, slack: true });

    expect(await screen.findByText(/you'll need to/i)).toBeVisible();
    expect(await screen.findByText(/set up Email/i)).toBeVisible();
    expect(await screen.findByText(/first/i)).toBeVisible();
  });

  describe("Slack Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });

  describe("Email Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });

    it("should filter out actions and links when sending a test subscription", async () => {
      setup();

      userEvent.click(await screen.findByText("Email it"));
      userEvent.click(
        await screen.findByPlaceholderText(
          "Enter user names or email addresses",
        ),
      );

      userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );

      userEvent.click(await screen.findByText("Send email now"));

      const payload = await fetchMock
        ?.lastCall("path:/api/pulse/test")
        ?.request?.json();
      expect(payload.cards).toHaveLength(1);
      expect(payload.cards[0].id).toEqual(dashcard.id);
    });
  });
});

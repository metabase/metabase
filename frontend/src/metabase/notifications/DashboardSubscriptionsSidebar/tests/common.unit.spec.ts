import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";
import type { DashboardSubscription } from "metabase-types/api";

import { dashcard, hasBasicFilterOptions, setup, user } from "./setup";

describe("DashboardSubscriptionsSidebar", () => {
  it("should forward non-admin to email form - when slack is not setup", async () => {
    setup({ isAdmin: false, email: true, slack: false });

    expect(await screen.findByText("Email this dashboard")).toBeInTheDocument();
  });

  it("should forward non-admin to slack form - when email is not setup", async () => {
    setup({ isAdmin: false, email: false, slack: true });

    expect(
      await screen.findByText("Send this dashboard to Slack"),
    ).toBeInTheDocument();
  });

  it("should not forward non-admins - when slack and email are both setup", async () => {
    setup({ isAdmin: false, email: true, slack: true });

    expect(await screen.findByText("Email it")).toBeInTheDocument();
    expect(await screen.findByText("Send it to Slack")).toBeInTheDocument();
  });

  it("should not forward admins to email - when slack is not setup", async () => {
    setup({ isAdmin: true, email: true, slack: false });

    expect(await screen.findByText("Email it")).toBeInTheDocument();
    expect(await screen.findByText("Configure Slack")).toBeInTheDocument();
  });

  it("should not forward admins to slack - when email is not setup", async () => {
    setup({ isAdmin: true, email: false, slack: true });

    expect(await screen.findByText("Set up email")).toBeInTheDocument();
    expect(await screen.findByText("Send it to Slack")).toBeInTheDocument();
  });

  it("should show email warning message", async () => {
    setup({ email: true, slack: true });

    await userEvent.click(await screen.findByText("Email it"));
    expect(await screen.findByText("Email this dashboard")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Recipients will see this data just as you see it, regardless of their permissions.",
      ),
    ).toBeInTheDocument();
  });

  describe.each([
    {
      slack: true,
    },
    {
      slack: false,
    },
  ])("Embedding SDK", ({ slack }) => {
    const testScenarioCondition = slack
      ? "Slack is set up"
      : "Slack is not set up";

    it(`should not show subscription options when ${testScenarioCondition}`, async () => {
      setup({ isEmbeddingSdk: true, email: true, slack });

      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();
    });

    // We don't test `email: false` because this sidebar is only accessible when email is already set up

    it(`should not show email warning message when ${testScenarioCondition}`, async () => {
      setup({ isEmbeddingSdk: true, email: true, slack });

      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          "Recipients will see this data just as you see it, regardless of their permissions.",
        ),
      ).not.toBeInTheDocument();
    });

    it(`should close the sidebar when the last pulse is archived and ${testScenarioCondition}`, async () => {
      const pulses = [
        {
          channels: [
            {
              schedule_type: "daily",
              schedule_hour: 0,
              channel_type: "email",
              enabled: true,
            },
          ],
          name: "E-commerce Insights",
          id: 10,
          cards: [],
        },
        {
          channels: [
            {
              schedule_type: "hourly",
              channel_type: "email",
              enabled: true,
            },
          ],
          name: "E-commerce Insights",
          id: 11,
          cards: [],
        },
      ] satisfies (Partial<DashboardSubscription> & { id: number })[];

      const setSharing = jest.fn();

      setup({
        isEmbeddingSdk: true,
        email: true,
        slack,
        setSharing,
        pulses,
      });

      // Delete the first subscription
      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      await userEvent.click(
        await screen.findByText("Emailed daily at 12:00 AM"),
      );
      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();
      await userEvent.click(
        await screen.findByText("Delete this subscription"),
      );

      let modal = screen.getByRole("dialog");
      await userEvent.click(await within(modal).findByRole("checkbox"));
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete" }),
      );

      expect(setSharing).not.toHaveBeenCalled();

      // Delete the last subscription
      await userEvent.click(await screen.findByText("Emailed hourly"));
      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();
      await userEvent.click(
        await screen.findByText("Delete this subscription"),
      );

      modal = screen.getByRole("dialog");
      await userEvent.click(await within(modal).findByRole("checkbox"));
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete" }),
      );

      expect(setSharing).toHaveBeenCalledWith(false);
    });

    /**
     * Isn't needed for EMB-1060 but I added it for completeness.
     */
    it(`should show pulse list view after creating the first subscription by a non-admin user ${testScenarioCondition}`, async () => {
      const user = {
        firstName: "John",
        lastName: "Doe",
      };
      setup({
        isEmbeddingSdk: true,
        email: true,
        slack,
        currentUser: user,
        pulseListDelay: 100,
      });

      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();

      // Create the first subscription
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      // (EMB-1099) The subscription channel options sidebar shouldn't be shown
      expect(
        screen.queryByText("Set up a dashboard subscription"),
      ).not.toBeInTheDocument();

      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      expect(await screen.findByText("Emailed hourly")).toBeInTheDocument();
      expect(await screen.findByText("John Doe")).toBeInTheDocument();
    });

    it(`should show pulse list view after creating the first subscription by an admin user ${testScenarioCondition} (EMB-1060)`, async () => {
      const user = {
        firstName: "Admin",
        lastName: "User",
      };
      setup({
        isAdmin: true,
        isEmbeddingSdk: true,
        email: true,
        slack,
        currentUser: user,
        pulseListDelay: 100,
      });

      expect(
        await screen.findByText("Email this dashboard"),
      ).toBeInTheDocument();

      // Create the first subscription
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      // (EMB-1099) The subscription channel options sidebar shouldn't be shown
      expect(
        screen.queryByText("Set up a dashboard subscription"),
      ).not.toBeInTheDocument();

      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      expect(await screen.findByText("Emailed hourly")).toBeInTheDocument();
      expect(await screen.findByText("Admin User")).toBeInTheDocument();
    });
  });

  describe("Slack Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      await userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });

  describe("Email Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });

    it("should filter out actions and links when sending a test subscription", async () => {
      setup();

      await userEvent.click(await screen.findByText("Email it"));
      await userEvent.click(
        await screen.findByPlaceholderText(
          "Enter user names or email addresses",
        ),
      );

      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );

      await userEvent.click(await screen.findByText("Send email now"));

      const lastCall = fetchMock.callHistory.lastCall(
        "path:/api/notification/send",
      );
      const payload = await lastCall?.request?.json();
      expect(payload.payload.dashboard_subscription_dashcards).toHaveLength(1);
      expect(
        payload.payload.dashboard_subscription_dashcards[0].card_id,
      ).toEqual(dashcard.card_id);
    });

    it("should send correct notification shape with hourly cron schedule", async () => {
      setup();

      await userEvent.click(await screen.findByText("Email it"));
      await userEvent.click(
        await screen.findByPlaceholderText(
          "Enter user names or email addresses",
        ),
      );

      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );

      await userEvent.click(await screen.findByText("Send email now"));

      const lastCall = fetchMock.callHistory.lastCall(
        "path:/api/notification/send",
      );
      const payload = await lastCall?.request?.json();

      // Verify notification shape
      expect(payload.payload_type).toEqual("notification/dashboard");
      expect(payload.handlers).toHaveLength(1);
      expect(payload.handlers[0].channel_type).toEqual("channel/email");
      expect(payload.handlers[0].recipients).toHaveLength(1);
      expect(payload.handlers[0].recipients[0].type).toEqual(
        "notification-recipient/user",
      );

      // Verify subscription has a valid hourly cron schedule
      expect(payload.subscriptions).toHaveLength(1);
      expect(payload.subscriptions[0].type).toEqual(
        "notification-subscription/cron",
      );
      // Hourly cron: minute field should be specific (0 or *), hour should be *
      const cron = payload.subscriptions[0].cron_schedule;
      const [_seconds, _minutes, hours] = cron.split(" ");
      expect(hours).toEqual("*");
    });
  });

  describe("Notification API shape", () => {
    it("should display existing subscriptions from notification API", async () => {
      const pulses = [
        {
          id: 1,
          channels: [
            {
              schedule_type: "daily" as const,
              schedule_hour: 9,
              channel_type: "email" as const,
              enabled: true,
              recipients: [
                {
                  id: 1,
                  email: "test@example.com",
                  common_name: "Test User",
                },
              ],
            },
          ],
          skip_if_empty: true,
        },
      ] satisfies (Partial<DashboardSubscription> & { id: number })[];

      setup({ pulses });

      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      expect(await screen.findByText(/Emailed daily/)).toBeInTheDocument();
      expect(await screen.findByText("Test User")).toBeInTheDocument();
    });

    it("should archive a subscription via notification PUT endpoint", async () => {
      const pulses = [
        {
          id: 42,
          channels: [
            {
              schedule_type: "weekly" as const,
              schedule_hour: 10,
              schedule_day: "mon" as const,
              channel_type: "email" as const,
              enabled: true,
              recipients: [
                {
                  id: 1,
                  email: "test@example.com",
                  common_name: "Test User",
                },
              ],
            },
          ],
        },
      ] satisfies (Partial<DashboardSubscription> & { id: number })[];

      setup({ pulses, isAdmin: true });

      // Open the subscription
      expect(await screen.findByText(/Emailed Monday/)).toBeInTheDocument();
      await userEvent.click(await screen.findByText(/Emailed Monday/));

      // Delete it
      await userEvent.click(
        await screen.findByText("Delete this subscription"),
      );
      const modal = screen.getByRole("dialog");
      await userEvent.click(await within(modal).findByRole("checkbox"));
      await userEvent.click(
        within(modal).getByRole("button", { name: "Delete" }),
      );

      // Verify the PUT was called with active: false
      const putCall = fetchMock.callHistory.lastCall(
        "express:/api/notification/:id",
      );
      expect(putCall).toBeTruthy();
      const putPayload = await putCall?.request?.json();
      expect(putPayload.active).toBe(false);
    });
  });
});

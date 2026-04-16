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

      // Dynamically modify `pulses` so that we get the new updated list of pulses after archiving
      fetchMock.put({
        url: "express:/api/pulse/:id",
        response: ({ expressParams = {} }) => {
          const pulseId = parseInt(expressParams?.id);
          pulses.splice(
            pulses.findIndex((pulse) => pulse.id === pulseId),
            1,
          );
          return {};
        },
      });

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

      const lastCall = fetchMock.callHistory.lastCall("path:/api/pulse/test");
      const payload = await lastCall?.request?.json();
      expect(payload.cards).toHaveLength(1);
      expect(payload.cards[0].id).toEqual(dashcard.id);
    });
  });
});

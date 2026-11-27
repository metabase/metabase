import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { addLocale, useLocale } from "ttag";

import { screen, waitFor, within } from "__support__/ui";
import type { DashboardSubscription } from "metabase-types/api";
import {
  createMockCard,
  createMockChannel,
  createMockDashboardCard,
  createMockDashboardSubscription,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  dashcard,
  hasBasicFilterOptions,
  pickFrequency,
  selectScheduleTime,
  setup,
  user,
} from "./setup";

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

    it("should show the report timezone in the schedule description (metabase#69496)", async () => {
      setup({ isAdmin: false, email: false, slack: true });

      await screen.findByText("Send this dashboard to Slack");

      await userEvent.click(screen.getByTestId("select-frequency"));
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText("daily"),
      );

      await selectScheduleTime();

      expect(
        await screen.findByText(
          "Slack messages will be sent at 8:00 AM UTC, your Metabase timezone.",
        ),
      ).toBeInTheDocument();
    });

    it("should enable 'Done' and 'Send to Slack now' only after a channel is picked, and save the channel id (metabase#14494, metabase#14515)", async () => {
      setup({ isAdmin: false, email: false, slack: true });

      await screen.findByText("Send this dashboard to Slack");
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Send to Slack now" }),
      ).toBeDisabled();

      await userEvent.click(
        screen.getByPlaceholderText("Pick a user or channel..."),
      );
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText("#random"),
      );

      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Send to Slack now" }),
      ).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("path:/api/pulse", { method: "POST" }),
        ).toHaveLength(1),
      );
      const payload: unknown = await fetchMock.callHistory
        .lastCall("path:/api/pulse", { method: "POST" })
        ?.request?.json();
      expect(payload).toMatchObject({
        channels: [
          {
            channel_type: "slack",
            details: { channel: "#random", channel_id: "C002" },
          },
        ],
      });
    });

    it("should send the include_pdf channel detail to the backend when the PDF switch is on", async () => {
      setup({ isAdmin: false, email: false, slack: true });

      await screen.findByText("Send this dashboard to Slack");

      // Pick a channel so the subscription is valid and can be sent
      await userEvent.type(
        await screen.findByPlaceholderText("Pick a user or channel..."),
        "#general",
      );

      await userEvent.click(
        await screen.findByRole("switch", {
          name: /Send dashboard as PDF/,
        }),
      );

      await userEvent.click(await screen.findByText("Send to Slack now"));

      const lastCall = fetchMock.callHistory.lastCall("path:/api/pulse/test");
      const payload = await lastCall?.request?.json();
      expect(payload.channels[0].details.channel).toBe("#general");
      expect(payload.channels[0].details.include_pdf).toBe(true);
    });
  });

  describe("Email Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });

    it("should show the report timezone in the schedule description (metabase#69496)", async () => {
      setup({ isAdmin: false, email: true, slack: false });

      await screen.findByText("Email this dashboard");

      await userEvent.click(screen.getByTestId("select-frequency"));
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText("daily"),
      );

      await selectScheduleTime();

      expect(
        await screen.findByText(
          "Emails will be sent at 8:00 AM UTC, your Metabase timezone.",
        ),
      ).toBeInTheDocument();
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

    it("should not enable 'Done' without a recipient, and keep 'Send email now' enabled when the frequency change clears the time (metabase#17657)", async () => {
      setup();

      await userEvent.click(await screen.findByText("Email it"));
      const recipientInput = await screen.findByPlaceholderText(
        "Enter user names or email addresses",
      );
      expect(recipientInput).toBeVisible();

      await pickFrequency("monthly");
      await selectScheduleTime();
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

      await userEvent.click(recipientInput);
      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );
      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();

      await pickFrequency("hourly");
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();

      await pickFrequency("weekly");

      const sendNowButton = screen.getByRole("button", {
        name: "Send email now",
      });
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
      expect(sendNowButton).toBeEnabled();

      await userEvent.click(sendNowButton);

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("path:/api/pulse/test"),
        ).toHaveLength(1),
      );
      const payload: unknown = await fetchMock.callHistory
        .lastCall("path:/api/pulse/test")
        ?.request?.json();
      expect(payload).toMatchObject({
        channels: [
          {
            channel_type: "email",
            schedule_type: "weekly",
            schedule_hour: null,
            recipients: [expect.objectContaining({ id: user.id })],
          },
        ],
      });
    });

    it("should persist the include_pdf channel detail when the PDF switch is toggled on", async () => {
      setup();

      await userEvent.click(await screen.findByText("Email it"));
      await screen.findByText("Email this dashboard");

      const pdfSwitch = await screen.findByRole("switch", {
        name: /Attach a PDF of the dashboard/,
      });
      expect(pdfSwitch).not.toBeChecked();

      await userEvent.click(pdfSwitch);
      expect(pdfSwitch).toBeChecked();

      // Confirm the flag rides along in the channel details on send
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
      expect(payload.channels[0].details.include_pdf).toBe(true);
    });

    it("should keep the typed text and add no recipient when Escape closes the people dropdown (metabase#17186, metabase#24629)", async () => {
      const otherUser = createMockUser({
        id: 2,
        first_name: "Bobby",
        last_name: "Kessler",
        common_name: "Bobby Kessler",
        email: "bobby@example.com",
      });
      setup({ recipients: [user, otherUser] });

      await userEvent.click(await screen.findByText("Email it"));
      const recipientInput = await screen.findByPlaceholderText(
        "Enter user names or email addresses",
      );
      await userEvent.click(recipientInput);
      expect(await screen.findByRole("listbox")).toHaveTextContent(
        user.first_name ?? "",
      );

      await userEvent.type(recipientInput, "Bobby");
      expect(
        within(screen.getByRole("listbox")).getByText("Bobby Kessler"),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("listbox")).queryByText(
          `${user.first_name} ${user.last_name}`,
        ),
      ).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      );
      expect(recipientInput).toBeVisible();
      expect(recipientInput).toHaveValue("Bobby");
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });

    it("should handle a saved subscription without recipients (metabase#17657)", async () => {
      const pulse = createMockDashboardSubscription({
        id: 10,
        channels: [
          createMockChannel({
            schedule_type: "monthly",
            schedule_day: "mon",
            schedule_hour: 8,
            schedule_frame: "first",
            recipients: [],
          }),
        ],
      });
      fetchMock.put("path:/api/pulse/10", async ({ options }) => {
        const body: unknown = JSON.parse(String(options.body));
        return body;
      });
      setup({ pulses: [pulse] });

      await userEvent.click(await screen.findByText(/^Emailed monthly/));
      expect(
        await screen.findByRole("button", { name: "Done" }),
      ).toBeDisabled();

      await userEvent.click(
        screen.getByPlaceholderText("Enter user names or email addresses"),
      );
      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      await waitFor(() =>
        expect(fetchMock.callHistory.calls("path:/api/pulse/10")).toHaveLength(
          1,
        ),
      );
      const payload: unknown = await fetchMock.callHistory
        .lastCall("path:/api/pulse/10")
        ?.request?.json();
      expect(payload).toMatchObject({
        channels: [
          {
            schedule_type: "monthly",
            schedule_frame: "first",
            recipients: [expect.objectContaining({ id: user.id })],
          },
        ],
      });
    });

    it("should open the email form for a non-admin who adds another subscription", async () => {
      setup({ isAdmin: false, email: true, slack: false });

      await screen.findByText("Email this dashboard");
      await userEvent.click(
        screen.getByPlaceholderText("Enter user names or email addresses"),
      );
      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      const payload: unknown = await fetchMock.callHistory
        .lastCall("path:/api/pulse", { method: "POST" })
        ?.request?.json();
      expect(payload).toMatchObject({
        channels: [
          {
            channel_type: "email",
            recipients: [expect.objectContaining({ id: user.id })],
          },
        ],
      });

      await userEvent.click(screen.getByLabelText("add icon"));
      expect(await screen.findByText("Email this dashboard")).toBeVisible();
    });

    it("should reset the new subscription form on cancel and persist the attachments of a saved one (metabase#30314, metabase#14117)", async () => {
      const ordersDashcard = createMockDashboardCard({
        id: 11,
        card_id: 21,
        card: createMockCard({ id: 21, name: "Orders", display: "table" }),
      });
      const productsDashcard = createMockDashboardCard({
        id: 12,
        card_id: 22,
        card: createMockCard({ id: 22, name: "Products", display: "table" }),
      });
      setup({ isAdmin: true, dashcards: [ordersDashcard, productsDashcard] });

      await userEvent.click(await screen.findByText("Email it"));
      const attachResults = await screen.findByLabelText("Attach results");
      expect(attachResults).not.toBeChecked();
      await userEvent.click(attachResults);
      const questionsToAttach = await screen.findByLabelText(
        "Questions to attach",
      );
      expect(questionsToAttach).not.toBeChecked();
      await userEvent.click(questionsToAttach);
      expect(screen.getByLabelText("Products")).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(await screen.findByText("Email it"));

      expect(await screen.findByLabelText("Attach results")).not.toBeChecked();
      expect(screen.queryByText("Questions to attach")).not.toBeInTheDocument();
      expect(screen.queryByText(".xlsx")).not.toBeInTheDocument();
      expect(screen.queryByText(".csv")).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByPlaceholderText("Enter user names or email addresses"),
      );
      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );
      await userEvent.keyboard("{Escape}");

      await userEvent.click(screen.getByLabelText("Attach results"));
      await userEvent.click(await screen.findByText("Questions to attach"));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      const payload: unknown = await fetchMock.callHistory
        .lastCall("path:/api/pulse", { method: "POST" })
        ?.request?.json();
      expect(payload).toMatchObject({
        cards: [
          { id: 21, dashboard_card_id: 11, include_csv: true },
          { id: 22, dashboard_card_id: 12, include_csv: true },
        ],
      });

      await userEvent.click(screen.getByText("Emailed hourly"));
      expect(await screen.findByText("Questions to attach")).toBeVisible();
      expect(screen.getByLabelText("Orders")).toBeChecked();
      expect(screen.getByLabelText("Products")).toBeChecked();
    });

    it("should not describe a monthly schedule with a 'null' day of the week (metabase#14405)", async () => {
      setup({ isAdmin: false, email: true, slack: false });

      await screen.findByText("Email this dashboard");
      await userEvent.click(
        screen.getByPlaceholderText("Enter user names or email addresses"),
      );
      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );
      await userEvent.click(screen.getByText("To"));

      await pickFrequency("monthly");
      await userEvent.click(screen.getByTestId("select-frame"));
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText("15th"),
      );
      await userEvent.click(screen.getByTestId("select-frame"));
      await userEvent.click(
        within(await screen.findByRole("listbox")).getByText("first"),
      );
      await selectScheduleTime();
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const description = await screen.findByText(
        /^Emailed monthly on the first/,
      );
      expect(description).toHaveTextContent(
        "Emailed monthly on the first calendar day at 8:00 AM",
      );
      expect(description).not.toHaveTextContent(/null/);
      const payload: unknown = await fetchMock.callHistory
        .lastCall("path:/api/pulse", { method: "POST" })
        ?.request?.json();
      expect(payload).toMatchObject({
        channels: [
          {
            schedule_type: "monthly",
            schedule_frame: "first",
            schedule_hour: 8,
          },
        ],
      });
    });

    it("should list exactly the recipients the server returns", async () => {
      const recipients = [
        createMockUser({
          id: 1,
          first_name: "Ada",
          last_name: "Lovelace",
          common_name: "Ada Lovelace",
        }),
        createMockUser({
          id: 2,
          first_name: "Bobby",
          last_name: "Kessler",
          common_name: "Bobby Kessler",
        }),
        createMockUser({
          id: 3,
          first_name: "Corbin",
          last_name: "Mertz",
          common_name: "Corbin Mertz",
        }),
      ];
      setup({ isAdmin: false, email: true, slack: false, recipients });

      await userEvent.click(
        await screen.findByPlaceholderText(
          "Enter user names or email addresses",
        ),
      );
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");
      expect(options).toHaveLength(3);
      recipients.forEach(({ common_name }) =>
        expect(
          within(listbox).getByRole("option", {
            name: new RegExp(common_name),
          }),
        ).toBeInTheDocument(),
      );
    });

    describe("with a non-English locale", () => {
      beforeEach(() => {
        addLocale("zz-fake", {
          headers: { "plural-forms": "nplurals=2; plural=(n != 1);" },
          translations: {
            "": {
              hourly: { msgid: "hourly", msgstr: ["[zz] hourly"] },
              "Delete this subscription": {
                msgid: "Delete this subscription",
                msgstr: ["[zz] Delete this subscription"],
              },
            },
            adverb: {
              hourly: { msgid: "hourly", msgstr: ["[zz] hourly"] },
            },
          },
        });
        useLocale("zz-fake");
      });

      afterEach(() => {
        useLocale("en");
      });

      it("should localize the schedule type in the delete confirmation modal", async () => {
        const pulse = createMockDashboardSubscription({
          id: 10,
          channels: [
            createMockChannel({ schedule_type: "hourly", recipients: [user] }),
          ],
        });
        setup({ pulses: [pulse] });

        await userEvent.click(await screen.findByText(/\[zz\] hourly/));
        await userEvent.click(
          await screen.findByText("[zz] Delete this subscription"),
        );

        const modal = await screen.findByTestId(
          "delete-confirmation-modal-pulse",
        );
        expect(within(modal).getByText("[zz] hourly")).toBeVisible();
      });
    });

    describe("subject", () => {
      const selectRecipient = async () => {
        await userEvent.click(
          await screen.findByPlaceholderText(
            "Enter user names or email addresses",
          ),
        );
        await userEvent.click(
          await screen.findByText(`${user.first_name} ${user.last_name}`),
        );
      };

      it("should use the dashboard name as the placeholder", async () => {
        setup();

        await userEvent.click(await screen.findByText("Email it"));

        expect(await screen.findByLabelText("Subject")).toHaveAttribute(
          "placeholder",
          "Dashboard",
        );
      });

      it("should send the typed subject when creating a subscription", async () => {
        setup();

        await userEvent.click(await screen.findByText("Email it"));
        await selectRecipient();
        await userEvent.type(
          await screen.findByLabelText("Subject"),
          "Weekly revenue",
        );
        await userEvent.click(screen.getByRole("button", { name: "Done" }));

        await waitFor(() =>
          expect(
            fetchMock.callHistory.called("path:/api/pulse", {
              method: "POST",
            }),
          ).toBe(true),
        );
        const lastCall = fetchMock.callHistory.lastCall("path:/api/pulse", {
          method: "POST",
        });
        const payload = await lastCall?.request?.json();
        expect(payload.channels[0].details.subject).toBe("Weekly revenue");
      });

      it("should drop the subject when it is cleared on an existing subscription", async () => {
        const pulse = createMockDashboardSubscription({
          id: 10,
          channels: [
            createMockChannel({
              schedule_type: "hourly",
              recipients: [user],
              details: { subject: "Weekly revenue" },
            }),
          ],
        });
        fetchMock.put("path:/api/pulse/10", pulse);
        setup({ pulses: [pulse] });

        await userEvent.click(await screen.findByText("Emailed hourly"));
        const subjectInput = await screen.findByLabelText("Subject");
        expect(subjectInput).toHaveValue("Weekly revenue");

        await userEvent.clear(subjectInput);
        await userEvent.click(screen.getByRole("button", { name: "Done" }));

        await waitFor(() =>
          expect(fetchMock.callHistory.called("path:/api/pulse/10")).toBe(true),
        );
        const lastCall = fetchMock.callHistory.lastCall("path:/api/pulse/10");
        const payload = await lastCall?.request?.json();
        expect(payload.channels[0].channel_type).toBe("email");
        expect(payload.channels[0].details).not.toHaveProperty("subject");
      });
    });
  });
});

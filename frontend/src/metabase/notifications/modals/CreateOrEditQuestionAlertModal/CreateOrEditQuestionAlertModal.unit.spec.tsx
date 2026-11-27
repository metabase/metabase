import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { setupCreateNotificationEndpoint } from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  ChannelSpec,
  GoalValue,
  Notification,
  NotificationChannel,
  UserListResult,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockTokenFeatures,
  createMockUser,
  createMockUserInfo,
  createMockUserListResult,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockChannel } from "metabase-types/api/mocks/channel";
import {
  createMockNotification,
  createMockNotificationCronSubscription,
} from "metabase-types/api/mocks/notification";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

const configuredAlerts = () => screen.findByTestId("alert-configured-channel");

const expectConfigured = async (channel: string) =>
  expect(
    within(await configuredAlerts()).getByText(channel),
  ).toBeInTheDocument();

const expectNotConfigured = async (channel: string) =>
  expect(
    within(await configuredAlerts()).queryByText(channel),
  ).not.toBeInTheDocument();

describe("CreateOrEditQuestionAlertModal", () => {
  it("should show 'When this question has results' for question cards", async () => {
    setup({ isAdmin: true });

    expect(await screen.findByTestId("alert-create")).toBeInTheDocument();
    const goalSelect = screen.getByTestId("alert-goal-select");
    expect(goalSelect).toHaveValue("When this question has results");
  });

  it("should show 'When this metric has results' for metric cards", async () => {
    setup({ isAdmin: true, cardType: "metric" });

    expect(await screen.findByTestId("alert-create")).toBeInTheDocument();
    const goalSelect = screen.getByTestId("alert-goal-select");
    expect(goalSelect).toHaveValue("When this metric has results");
  });

  it("should offer goal-based alerts when the goal value comes from another question", async () => {
    setup({
      isAdmin: true,
      goalValue: { type: "card", id: 2, column: "TARGET" },
    });

    await userEvent.click(await screen.findByTestId("alert-goal-select"));

    expect(
      screen.getByRole("option", { name: "When results go above the goal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "When results go below the goal" }),
    ).toBeInTheDocument();
  });

  it("should display first available channel by default - Email", async () => {
    setup({ isAdmin: true });

    expect(await screen.findByTestId("alert-create")).toBeInTheDocument();
    await expectConfigured("Email");
  });

  it.each([{ isAdmin: true }, { isAdmin: false, userCanAccessSettings: true }])(
    "should display first available channel by default - Slack %p",
    async (setupConfig) => {
      setup({
        isEmailSetup: false,
        isSlackSetup: true,
        ...setupConfig,
      });

      expect(await screen.findByTestId("alert-create")).toBeInTheDocument();
      await expectNotConfigured("Email");
      await expectConfigured("Slack");
    },
  );

  it.each([{ isAdmin: true }, { isAdmin: false, userCanAccessSettings: true }])(
    "should display first available channel by default - Webhook %p",
    async (setupConfig) => {
      const mockWebhook = createMockChannel();
      setup({
        isEmailSetup: false,
        isHttpSetup: true,
        webhooksResult: [mockWebhook],
        ...setupConfig,
      });

      expect(await screen.findByTestId("alert-create")).toBeInTheDocument();
      await expectNotConfigured("Email");
      expect(screen.getByText(mockWebhook.name)).toBeInTheDocument();
    },
  );

  it("should not show channels if user does not have permissions", async () => {
    const mockWebhook = createMockChannel();
    setup({
      isEmailSetup: false,
      isSlackSetup: true,
      isHttpSetup: true,
      webhooksResult: [mockWebhook],
      userCanAccessSettings: false,
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("alerts-channel-setup-modal"),
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("alert-create")).not.toBeInTheDocument();
  });

  it("should show set up channels model for non-admin users with access setting permission", async () => {
    setup({
      isEmailSetup: false,
      isSlackSetup: false,
      isHttpSetup: false,
      userCanAccessSettings: true,
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("alerts-channel-setup-modal"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByTestId("alerts-channel-create-webhook"),
    ).toBeInTheDocument();
  });

  it("should show daily schedule with no time selected by default", async () => {
    setup({
      isAdmin: true,
      isEmailSetup: true,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    const scheduleTypeSelect = screen.getByTestId("select-frequency");
    expect(scheduleTypeSelect).toHaveValue("daily");

    const timeSelector = screen.getByTestId("select-time");
    expect(timeSelector).toHaveValue("");
    expect(timeSelector).toHaveAttribute("placeholder", "HH:MM");
    expect(
      within(screen.getByTestId("select-am-pm")).getByRole("radio", {
        name: "AM",
      }),
    ).toBeChecked();

    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send now/i })).toBeEnabled();
  });

  it("should disable 'Send now' when there is nowhere to send the alert to", async () => {
    setup({
      isAdmin: true,
      isEmailSetup: false,
      isSlackSetup: true,
    });

    expect(await screen.findByTestId("alert-create")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /send now/i })).toBeDisabled();
  });

  it("should show the editing alert data when in edit mode", async () => {
    // Create a custom notification with weekly schedule on Monday at 2pm
    const mockNotification = createMockNotification({
      subscriptions: [
        createMockNotificationCronSubscription({
          cron_schedule: "0 0 14 ? * 2 *",
        }),
      ],
      payload: {
        card_id: 1,
        send_once: true,
        send_condition: "goal_above",
      },
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: mockNotification,
    });

    await waitFor(() => {
      // Should show "Edit alert" instead of "New alert"
      expect(screen.getByText("Edit alert")).toBeInTheDocument();
    });

    // Verify the schedule shows weekly (Monday)
    const scheduleTypeSelect = screen.getByTestId("select-frequency");
    expect(scheduleTypeSelect).toHaveValue("weekly");
    expect(screen.getByTestId("select-weekday")).toHaveValue("Monday");

    // Verify time is 2:00pm
    const timeSelector = screen.getByTestId("select-time");
    expect(timeSelector).toHaveValue("2:00");

    // Verify PM is selected
    const amPmSelector = screen.getByTestId("select-am-pm");
    // Unfortunately, there's not better way to check this element from Mantine.
    // eslint-disable-next-line testing-library/no-node-access
    const pmOption = amPmSelector.children[2];
    expect(pmOption).toHaveAttribute("data-active", "true");

    // Verify the "send once" switch is enabled
    const sendOnceSwitch = screen.getByLabelText(
      /delete this alert after it's triggered/i,
    );
    expect(sendOnceSwitch).toBeChecked();
  });

  it("should show hourly schedule with 5 minutes past the hour", async () => {
    // Create a notification with hourly schedule at 5 minutes past the hour
    const mockNotification = createMockNotification({
      subscriptions: [
        createMockNotificationCronSubscription({
          // Hourly at 5 minutes past the hour
          cron_schedule: "0 5 * * * ? *",
        }),
      ],
      payload: {
        card_id: 1,
        send_once: false,
        send_condition: "has_result",
      },
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: mockNotification,
    });

    await waitFor(() => {
      expect(screen.getByText("Edit alert")).toBeInTheDocument();
    });

    // Verify the schedule type is set to hourly
    const scheduleTypeSelect = screen.getByTestId("select-frequency");
    expect(scheduleTypeSelect).toHaveValue("hourly");

    // Verify the minutes value is set to 5
    const minuteSelector = screen.getByTestId("select-minute");
    expect(minuteSelector).toHaveValue("5");

    // Verify the send once switch is not checked
    const sendOnceSwitch = screen.getByLabelText(
      /delete this alert after it's triggered/i,
    );
    expect(sendOnceSwitch).not.toBeChecked();
  });

  it("should create a new notification with daily schedule at 8am", async () => {
    // Setup fetchMock for API call - note we use '*' matcher to capture any request to this endpoint
    fetchMock.postOnce("path:/api/notification", { body: { id: 123 } });
    const onAlertCreatedMock = jest.fn();

    setup({
      isAdmin: true,
      isEmailSetup: true,
      onAlertCreatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Verify default daily schedule is selected initially
    const scheduleTypeSelect = screen.getByTestId("select-frequency");
    expect(scheduleTypeSelect).toHaveValue("daily");

    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();

    // Explicitly select 8:00 as the alert time
    const timeSelector = screen.getByTestId("select-time");
    await userEvent.click(timeSelector);
    const option8am = screen.getByRole("option", { name: /8:00/i });
    await userEvent.click(option8am);

    const saveButton = screen.getByRole("button", { name: /done/i });
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    // Verify the API was called with the correct cron schedule for 8am
    const calls = fetchMock.callHistory.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      const subscription = JSON.parse(String(requestBody)).subscriptions[0];

      // Verify the cron schedule is for 8am daily
      expect(subscription.cron_schedule).toBe("0 0 8 * * ? *");
    });

    expect(onAlertCreatedMock).toHaveBeenCalledTimes(1);
  });

  it("should create a new notification with hourly schedule", async () => {
    fetchMock.postOnce("path:/api/notification", { body: { id: 123 } });
    const onAlertCreatedMock = jest.fn();

    setup({
      isAdmin: true,
      isEmailSetup: true,
      onAlertCreatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("select-frequency"));
    await userEvent.click(screen.getByRole("option", { name: /hourly/i }));

    const saveButton = screen.getByRole("button", { name: /done/i });
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    const calls = fetchMock.callHistory.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      const subscription = JSON.parse(String(requestBody)).subscriptions[0];

      expect(subscription.cron_schedule).toBe("0 0 * * * ? *");
    });

    expect(onAlertCreatedMock).toHaveBeenCalledTimes(1);
  });

  it("should create a new notification with custom schedule", async () => {
    // Setup fetchMock for API call - note we use '*' matcher to capture any request to this endpoint
    fetchMock.postOnce("path:/api/notification", { body: { id: 123 } });
    const onAlertCreatedMock = jest.fn();

    setup({
      isAdmin: true,
      isEmailSetup: true,
      onAlertCreatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Verify default daily schedule is selected initially
    const scheduleTypeSelect = screen.getByTestId("select-frequency");

    await userEvent.click(scheduleTypeSelect);
    const optionCustom = screen.getByRole("option", { name: /custom/i });
    await userEvent.click(optionCustom);

    // A new alert has no hour picked yet, so the hour is left as a wildcard
    const cronInput = screen.getByDisplayValue("0 * * * ?");

    await userEvent.clear(cronInput);
    await userEvent.type(cronInput, "0/10 8 * * ?");

    const saveButton = screen.getByRole("button", { name: /done/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the correct cron schedule for 8am
    const calls = fetchMock.callHistory.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      const subscription = JSON.parse(String(requestBody)).subscriptions[0];

      // Verify the cron schedule is for 8am daily
      expect(subscription.cron_schedule).toBe("0 0/10 8 * * ? *");
    });

    expect(onAlertCreatedMock).toHaveBeenCalledTimes(1);
  });

  it("should update submit button label through Done → Save changes → Save failed", async () => {
    const notificationId = 42;
    fetchMock.putOnce(`path:/api/notification/${notificationId}`, {
      status: 500,
      body: { message: "Internal server error" },
    });

    const mockNotification = createMockNotification({
      id: notificationId,
      subscriptions: [
        createMockNotificationCronSubscription({
          cron_schedule: "0 0 14 ? * 2 *",
        }),
      ],
      payload: {
        card_id: 1,
        send_once: false,
        send_condition: "has_result",
      },
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: mockNotification,
    });

    await screen.findByText("Edit alert");

    // No changes yet — button should say "Done"
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();

    // Make a change — button should say "Save changes"
    const weekdaySelector = screen.getByTestId("select-weekday");
    await userEvent.click(weekdaySelector);
    const tuesdayOption = screen.getByRole("option", { name: /Tuesday/i });
    await userEvent.click(tuesdayOption);

    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();

    // Submit with a failing API — button should say "Save failed"
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    expect(
      await screen.findByRole("button", { name: /save failed/i }),
    ).toBeInTheDocument();
  });

  it("should update an existing notification when in edit mode", async () => {
    const notificationId = 42;
    // Setup fetchMock for API call
    fetchMock.putOnce(`path:/api/notification/${notificationId}`, {
      body: { id: notificationId },
    });

    const onAlertUpdatedMock = jest.fn();

    // Create a weekly notification (Mondays at 2pm)
    const mockNotification = createMockNotification({
      id: notificationId,
      subscriptions: [
        createMockNotificationCronSubscription({
          cron_schedule: "0 0 14 ? * 2 *", // Monday at 2pm
        }),
      ],
      payload: {
        card_id: 1,
        send_once: true,
        send_condition: "goal_above",
      },
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: mockNotification,
      onAlertUpdatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("Edit alert")).toBeInTheDocument();
    });

    // Change schedule from Monday to Tuesday
    const weekdaySelector = screen.getByTestId("select-weekday");
    await userEvent.click(weekdaySelector);
    const tuesdayOption = screen.getByRole("option", { name: /Tuesday/i });
    await userEvent.click(tuesdayOption);

    // Click Save button
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the correct cron schedule for Tuesday at 2pm
    const calls = fetchMock.callHistory.calls(
      `path:/api/notification/${notificationId}`,
    );
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      const subscription = JSON.parse(String(requestBody)).subscriptions[0];

      // Verify the cron schedule is for Tuesday at 2pm (day 3)
      expect(subscription.cron_schedule).toBe("0 0 14 ? * 3 *");
    });

    expect(onAlertUpdatedMock).toHaveBeenCalledTimes(1);
  });

  it("should keep the subscription identity when the schedule loses its time and gets a new one", async () => {
    const notificationId = 42;
    const subscriptionId = 7;
    fetchMock.putOnce(`path:/api/notification/${notificationId}`, {
      body: { id: notificationId },
    });

    const mockNotification = createMockNotification({
      id: notificationId,
      subscriptions: [
        createMockNotificationCronSubscription({
          id: subscriptionId,
          notification_id: notificationId,
          cron_schedule: "0 0 9 * * ?",
        }),
      ],
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: mockNotification,
    });

    await waitFor(() => {
      expect(screen.getByText("Edit alert")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("select-frequency"));
    await userEvent.click(screen.getByRole("option", { name: /hourly/i }));

    await userEvent.click(screen.getByTestId("select-frequency"));
    await userEvent.click(screen.getByRole("option", { name: /daily/i }));

    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();

    await userEvent.click(screen.getByTestId("select-time"));
    await userEvent.click(screen.getByRole("option", { name: /10:00/i }));

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    const calls = fetchMock.callHistory.calls(
      `path:/api/notification/${notificationId}`,
    );
    expect(calls.length).toBe(1);

    const subscription = JSON.parse(String(calls[0].options?.body))
      .subscriptions[0];

    expect(subscription.id).toBe(subscriptionId);
    expect(subscription.notification_id).toBe(notificationId);
    expect(subscription.cron_schedule).toBe("0 0 10 * * ? *");
    expect(subscription.ui_display_type).toBe("cron/builder");
  });

  const OWNER_BLOCK_TITLE = /who owns this alert\?/i;

  it("should not show the owner picker when creating a new alert", async () => {
    setup({ isAdmin: true, isEmailSetup: true });

    expect(await screen.findByText("New alert")).toBeInTheDocument();
    expect(screen.queryByText(OWNER_BLOCK_TITLE)).not.toBeInTheDocument();
  });

  it("should not show the owner picker for non-admins editing an alert", async () => {
    setup({
      isAdmin: false,
      userCanAccessSettings: true,
      isEmailSetup: true,
      editingNotification: createMockNotification(),
    });

    expect(await screen.findByText("Edit alert")).toBeInTheDocument();
    expect(screen.queryByText(OWNER_BLOCK_TITLE)).not.toBeInTheDocument();
  });

  it("should show the current owner when an admin edits an alert", async () => {
    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: createMockNotification({
        creator_id: 3,
        creator: createMockUserInfo({ common_name: "Ann Admin" }),
      }),
    });

    expect(await screen.findByText(OWNER_BLOCK_TITLE)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Select a user")).toHaveValue(
      "Ann Admin",
    );
  });

  it("should send the new creator_id when an admin changes the owner", async () => {
    const notificationId = 42;
    fetchMock.putOnce(`path:/api/notification/${notificationId}`, {
      body: { id: notificationId },
    });

    const newOwner = createMockUserListResult({
      id: 7,
      common_name: "New Owner",
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      users: [newOwner],
      editingNotification: createMockNotification({
        id: notificationId,
        creator_id: 3,
        creator: createMockUserInfo({ common_name: "Ann Admin" }),
      }),
    });

    await screen.findByText("Edit alert");

    await userEvent.click(screen.getByPlaceholderText("Select a user"));
    await userEvent.click(
      await screen.findByRole("option", { name: "New Owner" }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /save changes/i }),
    );

    const calls = fetchMock.callHistory.calls(
      `path:/api/notification/${notificationId}`,
    );
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      expect(JSON.parse(String(requestBody)).creator_id).toBe(7);
    });
  });

  it("should not send the creator on 'Send now' in edit mode", async () => {
    fetchMock.postOnce("path:/api/notification/send", 204);

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: createMockNotification(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /send now/i }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/notification/send"),
      ).toHaveLength(1);
    });

    const [call] = fetchMock.callHistory.calls("path:/api/notification/send");
    const requestBody = JSON.parse(String(call.options?.body));

    expect(requestBody).not.toHaveProperty("creator");
    expect(requestBody).toHaveProperty("handlers");
  });

  describe("with no channel set up", () => {
    it("should link admins to the email, Slack and webhook settings", async () => {
      setup({
        isAdmin: true,
        isEmailSetup: false,
        isSlackSetup: false,
        isHttpSetup: false,
      });

      const setupModal = await screen.findByTestId(
        "alerts-channel-setup-modal",
      );
      expect(
        within(setupModal).getByText(
          "To get notified when something happens, or to send this chart on a schedule, first set up email, Slack, or a webhook.",
        ),
      ).toBeInTheDocument();
      expect(
        within(setupModal).getByRole("link", { name: /Set up email/ }),
      ).toHaveAttribute("href", "/admin/settings/email");
      expect(
        within(setupModal).getByRole("link", { name: /Set up Slack/ }),
      ).toHaveAttribute("href", "/admin/settings/slack");
      expect(
        within(setupModal).getByRole("link", { name: /Add a webhook/ }),
      ).toHaveAttribute("href", "/admin/settings/webhooks");
      expect(screen.queryByTestId("alert-create")).not.toBeInTheDocument();
    });

    it("should tell non-admins to ask an admin, without setup links", async () => {
      setup({
        isAdmin: false,
        userCanAccessSettings: false,
        isEmailSetup: false,
        isSlackSetup: false,
        isHttpSetup: false,
      });

      const setupModal = await screen.findByTestId(
        "alerts-channel-setup-modal",
      );
      expect(
        within(setupModal).getByText(
          "To get notified when something happens, or to send this chart on a schedule, ask your admin to set up email, Slack, or a webhook.",
        ),
      ).toBeInTheDocument();
      expect(
        within(setupModal).queryByText("Set up email"),
      ).not.toBeInTheDocument();
      expect(
        within(setupModal).queryByText("Set up Slack"),
      ).not.toBeInTheDocument();
      expect(
        within(setupModal).queryByText("Add a webhook"),
      ).not.toBeInTheDocument();
    });
  });

  describe("alert types", () => {
    const CARD_ID = 7;

    const getCreateRequestBody = async (): Promise<unknown> => {
      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/notification", {
            method: "POST",
          }),
        ).toHaveLength(1);
      });
      const [call] = fetchMock.callHistory.calls("path:/api/notification", {
        method: "POST",
      });
      return JSON.parse(String(await call.options?.body));
    };

    const pickTimeAndSubmit = async () => {
      await userEvent.click(screen.getByTestId("select-time"));
      await userEvent.click(screen.getByRole("option", { name: "8:00" }));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
    };

    const expectRowsAlertOnly = async () => {
      const goalSelect = screen.getByTestId("alert-goal-select");
      expect(goalSelect).toHaveTextContent("When this question has results");
      await userEvent.click(goalSelect);
      expect(
        screen.queryByRole("option", {
          name: "When results go above the goal",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("When results go above the goal"),
      ).not.toBeInTheDocument();
    };

    it("should only offer a rows-based alert for a timeseries question without a goal", async () => {
      setupCreateNotificationEndpoint();
      setup({
        isAdmin: true,
        cardId: CARD_ID,
        visualizationSettings: {
          "graph.show_goal": false,
          "graph.goal_value": 7000,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        },
      });

      expect(await screen.findByText("New alert")).toBeInTheDocument();
      await expectRowsAlertOnly();

      await pickTimeAndSubmit();

      expect(await getCreateRequestBody()).toMatchObject({
        payload: { card_id: CARD_ID, send_condition: "has_result" },
      });
    });

    it("should create a goal-based alert for a timeseries question with a goal", async () => {
      setupCreateNotificationEndpoint();
      setup({
        isAdmin: true,
        cardId: CARD_ID,
        visualizationSettings: {
          "graph.show_goal": true,
          "graph.goal_value": 7000,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        },
      });

      expect(await screen.findByText("New alert")).toBeInTheDocument();
      const goalSelect = screen.getByTestId("alert-goal-select");
      expect(goalSelect).toBeEnabled();
      await userEvent.click(goalSelect);
      expect(
        await screen.findByRole("option", {
          name: "When results go above the goal",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "When results go below the goal" }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("option", { name: "When results go above the goal" }),
      );

      await userEvent.click(
        screen.getByLabelText("Delete this Alert after it's triggered"),
      );
      await pickTimeAndSubmit();

      expect(await getCreateRequestBody()).toMatchObject({
        payload: {
          card_id: CARD_ID,
          send_condition: "goal_above",
          send_once: true,
        },
      });
    });

    it("should fall back to a rows-based alert for a multi-series question with a goal", async () => {
      setupCreateNotificationEndpoint();
      setup({
        isAdmin: true,
        cardId: CARD_ID,
        visualizationSettings: {
          "graph.show_goal": true,
          "graph.goal_value": 7000,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count", "sum"],
        },
      });

      expect(await screen.findByText("New alert")).toBeInTheDocument();
      await expectRowsAlertOnly();

      await pickTimeAndSubmit();

      expect(await getCreateRequestBody()).toMatchObject({
        payload: { card_id: CARD_ID, send_condition: "has_result" },
      });
    });
  });

  describe("channels", () => {
    const CARD_ID = 7;

    const getChannelBlock = (title: string) => {
      const block = screen
        .getAllByTestId("channel-block")
        .find((element) => within(element).queryByText(title));
      if (!block) {
        throw new Error(`No channel block titled ${title}`);
      }
      return block;
    };

    const getCreateRequestBody = async (): Promise<unknown> => {
      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/notification", {
            method: "POST",
          }),
        ).toHaveLength(1);
      });
      const [call] = fetchMock.callHistory.calls("path:/api/notification", {
        method: "POST",
      });
      return JSON.parse(String(await call.options?.body));
    };

    it("should set up an email alert and not show Slack when it is not configured (metabase#48407)", async () => {
      setupCreateNotificationEndpoint();
      setup({
        isAdmin: true,
        cardId: CARD_ID,
        isEmailSetup: true,
        isSlackSetup: false,
        visualizationSettings: {},
      });

      expect(await screen.findByText("New alert")).toBeInTheDocument();
      const configuredChannels = await configuredAlerts();
      expect(within(configuredChannels).getByText("Email")).toBeInTheDocument();
      expect(
        within(configuredChannels).queryByTestId("loading-indicator"),
      ).not.toBeInTheDocument();
      expect(
        within(configuredChannels).queryByText("Slack"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Slack" })).toHaveAttribute(
        "href",
        "/admin/settings/slack",
      );
      expect(screen.getByTestId("alert-goal-select")).toHaveTextContent(
        "When this question has results",
      );

      await userEvent.click(screen.getByTestId("select-time"));
      await userEvent.click(screen.getByRole("option", { name: "8:00" }));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const body = await getCreateRequestBody();
      expect(body).toMatchObject({
        payload: { card_id: CARD_ID, send_condition: "has_result" },
        handlers: [{ channel_type: "channel/email" }],
      });
      expect(body).toHaveProperty("handlers.length", 1);
    });

    it("should respect email toggled off and save the Slack channel_id (metabase#12349)", async () => {
      setupCreateNotificationEndpoint();
      setup({
        isAdmin: true,
        cardId: CARD_ID,
        isEmailSetup: true,
        isSlackSetup: true,
        isHttpSetup: true,
        webhooksResult: [createMockChannel({ id: 3, name: "Webhook" })],
        slackFields: [
          {
            name: "channel",
            displayName: "Post to",
            options: [
              { displayName: "#work", id: "C001" },
              { displayName: "#play", id: "C002" },
            ],
            required: true,
          },
        ],
      });

      expect(await screen.findByText("New alert")).toBeInTheDocument();
      await expectConfigured("Email");

      await userEvent.click(
        within(getChannelBlock("Email")).getByRole("button", {
          name: "Remove",
        }),
      );
      await userEvent.click(screen.getByText("Add a destination"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Slack" }),
      );

      await userEvent.click(
        screen.getByPlaceholderText(/Pick a user or channel/),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "#play" }),
      );

      await userEvent.click(screen.getByText("Add another destination"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Email" }),
      );
      await expectConfigured("Email");
      await userEvent.click(
        within(getChannelBlock("Email")).getByRole("button", {
          name: "Remove",
        }),
      );
      await expectNotConfigured("Email");

      await userEvent.click(screen.getByTestId("select-time"));
      await userEvent.click(screen.getByRole("option", { name: "8:00" }));
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const body = await getCreateRequestBody();
      expect(body).toHaveProperty("handlers", [
        {
          channel_type: "channel/slack",
          recipients: [
            {
              type: "notification-recipient/raw-value",
              details: { value: "#play", channel_id: "C002" },
            },
          ],
        },
      ]);
    });
  });
});

function setup({
  userCanAccessSettings = false,
  isAdmin = false,
  isEmailSetup = true,
  isSlackSetup = false,
  isHttpSetup = false,
  webhooksResult = [],
  editingNotification,
  onAlertCreatedMock = jest.fn(),
  onAlertUpdatedMock = jest.fn(),
  cardType = "question",
  goalValue,
  users = [],
  cardId = 1,
  visualizationSettings = {
    "graph.show_goal": true,
    "graph.metrics": ["count"],
  },
  slackFields,
}: {
  userCanAccessSettings?: boolean;
  isAdmin?: boolean;
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isHttpSetup?: boolean;
  webhooksResult?: NotificationChannel[];
  editingNotification?: Notification;
  onAlertCreatedMock?: jest.Mock;
  onAlertUpdatedMock?: jest.Mock;
  cardType?: "question" | "model" | "metric";
  goalValue?: GoalValue;
  users?: UserListResult[];
  cardId?: number;
  visualizationSettings?: VisualizationSettings;
  slackFields?: ChannelSpec["fields"];
}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
    }),
  });

  setupEnterpriseOnlyPlugin("advanced_permissions");
  setupEnterpriseOnlyPlugin("application_permissions");

  const mockCard = createMockCard({
    id: cardId,
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    type: cardType,
    display: "line",
    visualization_settings: createMockVisualizationSettings({
      ...visualizationSettings,
      ...(goalValue !== undefined && { "graph.goal_value": goalValue }),
    }),
  });

  setupNotificationChannelsEndpoints({
    slack: { configured: isSlackSetup, fields: slackFields },
    email: { configured: isEmailSetup },
    http: { configured: isHttpSetup },
  });

  setupWebhookChannelsEndpoint(webhooksResult);
  setupUserRecipientsEndpoint({ users: [] });
  setupUsersEndpoints(users);

  const currentUser = createMockUser(
    isAdmin ? { is_superuser: true } : undefined,
  );

  if (userCanAccessSettings) {
    currentUser.permissions = {
      can_access_setting: true,
      can_access_monitoring: false,
      can_access_subscription: false,
    };
  }
  const storeInitialState = createMockState({
    currentUser,
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [mockCard],
    }),
    settings,
  });
  const storeConfig = { storeInitialState };

  const metadata = createMockMetadataFromState(storeInitialState);
  // The modal takes `question` as a prop. In production it comes from the `getQuestion` selector
  // which composes metrics and models into runnable ad-hoc questions.
  // Matching that behavior here.
  const savedQuestion = new Question(mockCard, metadata);
  const question =
    cardType === "metric" || cardType === "model"
      ? savedQuestion.composeQuestion()
      : savedQuestion;

  if (editingNotification) {
    renderWithProviders(
      <CreateOrEditQuestionAlertModal
        question={question}
        editingNotification={editingNotification}
        onAlertUpdated={onAlertUpdatedMock}
        onClose={jest.fn()}
      />,
      storeConfig,
    );
    return;
  }

  renderWithProviders(
    <CreateOrEditQuestionAlertModal
      question={question}
      onAlertCreated={onAlertCreatedMock}
      onClose={jest.fn()}
    />,
    storeConfig,
  );
}

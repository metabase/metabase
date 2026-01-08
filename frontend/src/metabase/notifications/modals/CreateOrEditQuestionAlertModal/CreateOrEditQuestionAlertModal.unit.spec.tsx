import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { CreateOrEditQuestionAlertModalWithQuestion } from "metabase/notifications/modals";
import type {
  ChannelApiResponse,
  Notification,
  NotificationChannel,
} from "metabase-types/api";
import {
  createMockCard,
  createMockTokenFeatures,
  createMockUser,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockChannel } from "metabase-types/api/mocks/channel";
import {
  createMockNotification,
  createMockNotificationCronSubscription,
} from "metabase-types/api/mocks/notification";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";

describe("CreateOrEditQuestionAlertModalWithQuestion", () => {
  it("should display first available channel by default - Email", async () => {
    setup({
      isAdmin: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("alert-create")).toBeInTheDocument();
    });

    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it.each([{ isAdmin: true }, { isAdmin: false, userCanAccessSettings: true }])(
    "should display first available channel by default - Slack %p",
    async (setupConfig) => {
      setup({
        isEmailSetup: false,
        isSlackSetup: true,
        ...setupConfig,
      });

      await waitFor(() => {
        expect(screen.getByTestId("alert-create")).toBeInTheDocument();
      });

      expect(screen.queryByText("Email")).not.toBeInTheDocument();
      expect(screen.getByText("Slack")).toBeInTheDocument();
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

      await waitFor(() => {
        expect(screen.getByTestId("alert-create")).toBeInTheDocument();
      });

      expect(screen.queryByText("Email")).not.toBeInTheDocument();
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

  it("should show daily and 8am as default schedule settings", async () => {
    setup({
      isAdmin: true,
      isEmailSetup: true,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Find the schedule type select (showing "daily")
    const scheduleTypeSelect = screen.getByTestId("select-frequency");
    expect(scheduleTypeSelect).toHaveValue("daily");

    // Find the time selector (showing "8:00")
    const timeSelector = screen.getByTestId("select-time");
    expect(timeSelector).toHaveValue("8:00");
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

    // screen.debug(undefined, Infinity);
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

    // Change time from default 9:00 to 8:00
    const timeSelector = screen.getByTestId("select-time");
    await userEvent.click(timeSelector);
    const option8am = screen.getByRole("option", { name: /8:00/i });
    await userEvent.click(option8am);

    const saveButton = screen.getByRole("button", { name: /done/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the correct cron schedule for 8am
    const calls = fetchMock.callHistory.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      const subscription = JSON.parse(requestBody as string).subscriptions[0];

      // Verify the cron schedule is for 8am daily
      expect(subscription.cron_schedule).toBe("0 0 8 * * ? *");
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

    const cronInput = screen.getByDisplayValue("0 8 * * ?");

    await userEvent.clear(cronInput);
    await userEvent.type(cronInput, "0/10 8 * * ?");

    const saveButton = screen.getByRole("button", { name: /done/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the correct cron schedule for 8am
    const calls = fetchMock.callHistory.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0].options?.body;
      const subscription = JSON.parse(requestBody as string).subscriptions[0];

      // Verify the cron schedule is for 8am daily
      expect(subscription.cron_schedule).toBe("0 0/10 8 * * ? *");
    });

    expect(onAlertCreatedMock).toHaveBeenCalledTimes(1);
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
      const subscription = JSON.parse(requestBody as string).subscriptions[0];

      // Verify the cron schedule is for Tuesday at 2pm (day 3)
      expect(subscription.cron_schedule).toBe("0 0 14 ? * 3 *");
    });

    expect(onAlertUpdatedMock).toHaveBeenCalledTimes(1);
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
}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
    }),
  });

  setupEnterpriseOnlyPlugin("advanced_permissions");
  setupEnterpriseOnlyPlugin("application_permissions");

  const mockCard = createMockCard({
    display: "line",
    visualization_settings: createMockVisualizationSettings({
      "graph.show_goal": true,
      "graph.metrics": ["count"],
    }),
  });

  setupNotificationChannelsEndpoints({
    slack: { configured: isSlackSetup },
    email: { configured: isEmailSetup },
    http: { configured: isHttpSetup },
  } as ChannelApiResponse["channels"]);

  setupWebhookChannelsEndpoint(webhooksResult);
  setupUserRecipientsEndpoint({ users: [] });

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
  const storeConfig = {
    storeInitialState: {
      currentUser,
      qb: createMockQueryBuilderState({
        card: mockCard,
      }),
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
        questions: [mockCard],
      }),
      settings,
    },
  };

  if (editingNotification) {
    renderWithProviders(
      <CreateOrEditQuestionAlertModalWithQuestion
        editingNotification={editingNotification}
        onAlertUpdated={onAlertUpdatedMock}
        onClose={jest.fn()}
      />,
      storeConfig,
    );
    return;
  }

  renderWithProviders(
    <CreateOrEditQuestionAlertModalWithQuestion
      onAlertCreated={onAlertCreatedMock}
      onClose={jest.fn()}
    />,
    storeConfig,
  );
}

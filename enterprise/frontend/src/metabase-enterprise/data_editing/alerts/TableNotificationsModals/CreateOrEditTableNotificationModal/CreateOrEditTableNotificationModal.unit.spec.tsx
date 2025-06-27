import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { UserWithApplicationPermissions } from "metabase/plugins";
import type {
  ChannelApiResponse,
  NotificationChannel,
  NotificationTriggerEvent,
  TableNotification,
} from "metabase-types/api";
import {
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockChannel } from "metabase-types/api/mocks/channel";
import {
  createMockNotificationHandlerEmail,
  createMockNotificationRecipientUser,
} from "metabase-types/api/mocks/notification";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { CreateOrEditTableNotificationModal } from "./CreateOrEditTableNotificationModal";

describe("CreateOrEditTableNotificationModal", () => {
  beforeEach(() => {
    fetchMock.reset();
    fetchMock.post("path:/api/notification/payload", { body: { id: 123 } });
  });

  afterEach(() => {
    fetchMock.restore();
  });

  it("should display first available channel by default - Email", async () => {
    setup({
      isAdmin: true,
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("table-notification-create"),
      ).toBeInTheDocument();
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
        expect(
          screen.getByTestId("table-notification-create"),
        ).toBeInTheDocument();
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
        expect(
          screen.getByTestId("table-notification-create"),
        ).toBeInTheDocument();
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

    expect(
      screen.queryByTestId("table-notification-create"),
    ).not.toBeInTheDocument();
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

  it("should show row created event as the default trigger", async () => {
    setup({
      isAdmin: true,
      isEmailSetup: true,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Check that the correct option is selected (UI displays the label, not the value)
    const triggerSelect = screen.getByTestId("notification-event-select");
    expect(triggerSelect).toHaveValue("When new records are created");
  });

  it("should show the correct event options for table notifications", async () => {
    setup({
      isAdmin: true,
      isEmailSetup: true,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Click on the event select to open the dropdown
    const triggerSelect = screen.getByTestId("notification-event-select");
    await userEvent.click(triggerSelect);

    // Verify all event options are available
    expect(
      screen.getByRole("option", { name: /When new records are created/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /When any cell changes it's value/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /When records are deleted/i }),
    ).toBeInTheDocument();
  });

  it("should show notification data when in edit mode", async () => {
    // Create a custom notification with 'row updated' event
    const mockNotification = createMockTableNotification({
      event_name: "event/row.updated",
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

    // Verify the correct event is selected (UI displays the label, not the value)
    const triggerSelect = screen.getByTestId("notification-event-select");
    expect(triggerSelect).toHaveValue("When any cell changes it's value");
  });

  it("should create a new notification with default settings", async () => {
    // Setup fetchMock for API call
    fetchMock.postOnce("path:/api/notification", { body: { id: 123 } });
    const onNotificationCreatedMock = jest.fn();

    setup({
      isAdmin: true,
      isEmailSetup: true,
      onNotificationCreatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Click save button without changing anything
    const saveButton = screen.getByRole("button", { name: /done/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the default settings
    const calls = fetchMock.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    const requestBody = await calls[0][1]?.body;
    const parsedBody = JSON.parse(requestBody as string);

    await waitFor(() => {
      expect(parsedBody.payload.event_name).toBe("event/row.created");
    });

    // Verify it has the default table_id
    expect(parsedBody.payload.table_id).toBe(42);

    // Verify it has at least one handler
    expect(parsedBody.handlers.length).toBeGreaterThan(0);

    expect(onNotificationCreatedMock).toHaveBeenCalledTimes(1);
  });

  it("should change notification event and create new notification", async () => {
    // Setup fetchMock for API call
    fetchMock.postOnce("path:/api/notification", { body: { id: 123 } });
    const onNotificationCreatedMock = jest.fn();

    setup({
      isAdmin: true,
      isEmailSetup: true,
      onNotificationCreatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("New alert")).toBeInTheDocument();
    });

    // Change the event to "row updated"
    const triggerSelect = screen.getByTestId("notification-event-select");
    await userEvent.click(triggerSelect);
    await userEvent.click(
      screen.getByRole("option", { name: /When any cell changes it's value/i }),
    );

    // Click save button
    const saveButton = screen.getByRole("button", { name: /done/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the updated event
    const calls = fetchMock.calls("path:/api/notification");
    expect(calls.length).toBe(1);

    const requestBody = await calls[0][1]?.body;
    const parsedBody = JSON.parse(requestBody as string);

    await waitFor(() => {
      expect(parsedBody.payload.event_name).toBe("event/row.updated");
    });

    // Additional assertions...
  });

  it("should update an existing notification when in edit mode", async () => {
    const notificationId = 42;
    // Setup fetchMock for API call
    fetchMock.putOnce(`path:/api/notification/${notificationId}`, {
      body: { id: notificationId },
    });

    const onNotificationUpdatedMock = jest.fn();

    // Create a notification with 'row created' event
    const mockNotification = createMockTableNotification({
      id: notificationId,
      event_name: "event/row.created",
    });

    setup({
      isAdmin: true,
      isEmailSetup: true,
      editingNotification: mockNotification,
      onNotificationUpdatedMock,
    });

    await waitFor(() => {
      expect(screen.getByText("Edit alert")).toBeInTheDocument();
    });

    // Change event from 'row created' to 'row updated'
    const triggerSelect = screen.getByTestId("notification-event-select");
    await userEvent.click(triggerSelect);

    const updateOption = screen.getByRole("option", {
      name: /When any cell changes it's value/i,
    });
    await userEvent.click(updateOption);

    // Click Save button
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    await userEvent.click(saveButton);

    // Verify the API was called with the updated event
    const calls = fetchMock.calls(`path:/api/notification/${notificationId}`);
    expect(calls.length).toBe(1);

    await waitFor(async () => {
      const requestBody = await calls[0][1]?.body;
      const parsedBody = JSON.parse(requestBody as string);
      return parsedBody; // Return the parsed body for later assertions
    }).then((parsedBody) => {
      // Verify the event has been changed to 'row updated'
      expect(parsedBody.payload.event_name).toBe("event/row.updated");
    });

    expect(onNotificationUpdatedMock).toHaveBeenCalledTimes(1);
  });
});

// Helper function to create a mock table notification
function createMockTableNotification({
  id = 123,
  event_name = "event/row.created",
  table_id = 42,
  user_id = 1,
}: {
  id?: number;
  event_name?: NotificationTriggerEvent;
  table_id?: number;
  user_id?: number;
}): TableNotification {
  const user = createMockUser({ id: user_id });
  return {
    id,
    active: true,
    creator_id: user_id,
    creator: user,
    handlers: [
      createMockNotificationHandlerEmail({
        recipients: [
          createMockNotificationRecipientUser({
            user_id,
            user,
          }),
        ],
      }),
    ],
    created_at: "2025-01-07T12:00:00Z",
    updated_at: "2025-01-07T12:00:00Z",
    payload_type: "notification/system-event",
    payload: {
      event_name,
      table_id,
    },
    payload_id: null,
    condition: ["=", ["field", "id"], 1],
  };
}

function setup({
  userCanAccessSettings = false,
  isAdmin = false,
  isEmailSetup = true,
  isSlackSetup = false,
  isHttpSetup = false,
  webhooksResult = [],
  editingNotification,
  onNotificationCreatedMock = jest.fn(),
  onNotificationUpdatedMock = jest.fn(),
}: {
  userCanAccessSettings?: boolean;
  isAdmin?: boolean;
  isEmailSetup?: boolean;
  isSlackSetup?: boolean;
  isHttpSetup?: boolean;
  webhooksResult?: NotificationChannel[];
  editingNotification?: TableNotification;
  onNotificationCreatedMock?: jest.Mock;
  onNotificationUpdatedMock?: jest.Mock;
}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: true,
    }),
  });

  setupEnterprisePlugins();

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
    (currentUser as UserWithApplicationPermissions).permissions = {
      can_access_setting: true,
      can_access_monitoring: false,
      can_access_subscription: false,
    };
  }

  const database = createSampleDatabase();
  const _table = createMockTable({ id: 42 });

  return renderWithProviders(
    <CreateOrEditTableNotificationModal
      tableId={_table.id}
      notification={editingNotification ?? null}
      onClose={jest.fn()}
      onNotificationCreated={onNotificationCreatedMock}
      onNotificationUpdated={onNotificationUpdatedMock}
    />,
    {
      storeInitialState: {
        currentUser,
        settings,
        entities: createMockEntitiesState({
          databases: [database],
          tables: [_table],
        }),
      },
    },
  );
}

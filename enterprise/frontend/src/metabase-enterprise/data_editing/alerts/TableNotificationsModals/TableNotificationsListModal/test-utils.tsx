import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { UserWithApplicationPermissions } from "metabase/plugins";
import { TableNotificationsListModal } from "metabase-enterprise/data_editing/alerts/TableNotificationsModals/TableNotificationsListModal/TableNotificationsListModal";
import type { TableNotification, User } from "metabase-types/api";
import {
  createMockTableNotification,
  createMockUser,
} from "metabase-types/api/mocks";

export interface SetupOpts {
  notifications?: TableNotification[];
  isAdmin?: boolean;
  canManageSubscriptions?: boolean;
  currentUserId?: number;
  onCreate?: jest.Mock;
  onEdit?: jest.Mock;
  onDelete?: jest.Mock;
  onUnsubscribe?: jest.Mock;
  onClose?: jest.Mock;
  webhooksConfig?: any[];
  users?: User[];
  opened?: boolean;
}

export const setup = ({
  notifications = [],
  isAdmin = false,
  canManageSubscriptions = false,
  currentUserId = 1,
  onCreate = jest.fn(),
  onEdit = jest.fn(),
  onDelete = jest.fn(),
  onUnsubscribe = jest.fn(),
  onClose = jest.fn(),
  webhooksConfig = [],
  users = [],
  opened = true,
}: SetupOpts = {}) => {
  // Set up mock users and webhooks
  setupWebhookChannelsEndpoint(webhooksConfig);
  setupUserRecipientsEndpoint({ users });

  // Create current user with appropriate permissions
  const currentUser = createMockUser({
    id: currentUserId,
    is_superuser: isAdmin,
  });

  if (canManageSubscriptions) {
    (currentUser as UserWithApplicationPermissions).permissions = {
      can_access_setting: false,
      can_access_monitoring: false,
      can_access_subscription: true,
    };
  }

  const settings = mockSettings();

  return {
    ...renderWithProviders(
      <TableNotificationsListModal
        notifications={notifications}
        opened={opened}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
        onUnsubscribe={onUnsubscribe}
        onClose={onClose}
      />,
      {
        storeInitialState: {
          currentUser,
          settings,
        },
      },
    ),
    onCreate,
    onEdit,
    onDelete,
    onUnsubscribe,
    onClose,
  };
};

export const createNotificationForUser = (
  userId: number,
  index = 0,
  extra?: Partial<TableNotification>,
): TableNotification => {
  return {
    ...createMockTableNotification(),
    id: userId * 100 + index, // Ensure unique IDs
    creator: createMockUser({ id: userId, first_name: `User ${userId}` }),
    creator_id: userId,
    // Use payload to make each notification unique for testing
    payload: {
      event_name: "event/row.created",
      table_id: index + 1,
    },
    payload_id: null,
    ...extra,
  };
};
